package com.campus.backend.service;

import com.campus.backend.dto.Emotion;
import com.campus.backend.entity.*;
import com.campus.backend.vector.DocumentMatch;
import com.campus.backend.vector.EmbeddingService;
import dev.langchain4j.model.chat.ChatLanguageModel;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.util.FileCopyUtils;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class AiService {

    private final EmbeddingService embeddingService;
    private final ChatLanguageModel chatModel;
    private final UserPreferenceService userPreferenceService;
    private final ConversationMemoryService conversationMemoryService;

    private final Resource ragPromptResource;
    private String promptTemplate;

    private static final double RELEVANCE_THRESHOLD = 0.6;
    private static final int HISTORY_LIMIT = 10;
    private static final String DEFAULT_CONVERSATION_KEY = "default";

    public AiService(
            EmbeddingService embeddingService,
            ChatLanguageModel chatModel,
            UserPreferenceService userPreferenceService,
            ConversationMemoryService conversationMemoryService,
            @Value("classpath:prompts/rag-template.txt") Resource ragPromptResource
    ) {
        this.embeddingService = embeddingService;
        this.chatModel = chatModel;
        this.userPreferenceService = userPreferenceService;
        this.conversationMemoryService = conversationMemoryService;
        this.ragPromptResource = ragPromptResource;
    }

    @PostConstruct
    public void init() {
        try (InputStreamReader reader = new InputStreamReader(ragPromptResource.getInputStream(), StandardCharsets.UTF_8)) {
            this.promptTemplate = FileCopyUtils.copyToString(reader);
        } catch (IOException e) {
            throw new UncheckedIOException("Prompt dosyası okunamadı: " + ragPromptResource, e);
        }
    }

    public String getAiResponse(String userQuery) {
        return getAiResponse(userQuery, Emotion.UNKNOWN);
    }

    public String getAiResponse(String userQuery, Emotion emotion) {

        // 0) userId + conversation
        Long userId = resolveCurrentUserIdOrNull();
        Conversation conversation = null;
        String historyBlock = "";

        if (userId != null) {
            conversation = conversationMemoryService.getOrCreate(userId, DEFAULT_CONVERSATION_KEY);
            var history = conversationMemoryService.getLastMessages(conversation.getId(), HISTORY_LIMIT);
            historyBlock = formatHistory(history);
        }

        // 1) Preference oku
        UserPreference pref = resolveCurrentUserPreferenceOrNull();
        boolean citationsEnabled = (pref != null) && pref.isCitations();

        // 2) Eğer kullanıcı “konuşma geçmişi” soruyorsa RAG guardrail’e takılma
        boolean memoryQuestion = isConversationMemoryQuery(userQuery);
        if (memoryQuestion) {
            String preferencePolicy = buildPreferenceAndEmotionPolicy(pref, emotion);

            String memoryPrompt =
                    preferencePolicy + "\n\n" +
                            "KONUŞMA GEÇMİŞİ (yalnızca bağlam içindir; burada yazmayanı uydurma):\n" +
                            (historyBlock.isBlank() ? "(Geçmiş yok)\n" : historyBlock + "\n") +
                            "\nKullanıcı sorusu:\n" + userQuery + "\n\n" +
                            "Kurallar:\n" +
                            "- Yalnızca KONUŞMA GEÇMİŞİ'nde geçenlere dayan.\n" +
                            "- Geçmişte yoksa açıkça 'Bu konuşmada bunu göremiyorum' de.\n" +
                            "- Türkçe, kısa ve net yaz.\n";

            String answerRaw = chatModel.generate(memoryPrompt);
            if (answerRaw == null) answerRaw = "";

            // Kaydet (history temiz kalsın)
            if (conversation != null) {
                conversationMemoryService.append(conversation, ConversationMessageRole.USER, userQuery);
                conversationMemoryService.append(conversation, ConversationMessageRole.ASSISTANT, stripSourcesSection(answerRaw));
            }

            return stripSourcesSection(answerRaw).trim();
        }

        // 3) RAG match
        List<DocumentMatch> matches = embeddingService.findRelevantDocuments(userQuery, 5);

        // 4) Guardrail (duyuruda yoksa)
        if (matches.isEmpty() || matches.get(0).distance() > RELEVANCE_THRESHOLD) {
            // Yine de mesajları kaydedelim ki diyalog akışı bozulmasın
            if (conversation != null) {
                conversationMemoryService.append(conversation, ConversationMessageRole.USER, userQuery);
                conversationMemoryService.append(conversation, ConversationMessageRole.ASSISTANT,
                        "Bu bilgi duyurularda geçmiyor. İstersen duyurunun başlığını veya linkini paylaşırsan birlikte netleştirebilirim.");
            }
            return "Bu bilgi duyurularda geçmiyor. İstersen duyurunun başlığını veya linkini paylaşırsan birlikte netleştirebilirim.";
        }

        // ✅ 5) Citations açıksa tek duyuru kullan
        List<DocumentMatch> usedMatches = citationsEnabled ? matches.subList(0, 1) : matches;

        // 6) Context: duyuru metni
        String context = usedMatches.stream()
                .map(m -> "Duyuru: " + m.text())
                .collect(Collectors.joining("\n---\n"));

        // 7) Policy (preference + emotion)
        String preferencePolicy = buildPreferenceAndEmotionPolicy(pref, emotion)
                + "\n- Not: Konuşma geçmişi yalnızca bağlam içindir; gerçek bilgi için BAĞLAM'a dayan.\n";

        // 8) Template
        String emotionValue = (emotion != null) ? emotion.name() : "UNKNOWN";
        String ragPrompt = String.format(this.promptTemplate, context, emotionValue, userQuery);

        // 9) Final prompt (history + rag)
        String finalPrompt =
                preferencePolicy + "\n\n" +
                        "KONUŞMA GEÇMİŞİ (bağlam):\n" +
                        (historyBlock.isBlank() ? "(Geçmiş yok)\n" : historyBlock + "\n") +
                        "\n" + ragPrompt;

        // 10) Generate
        String answer = chatModel.generate(finalPrompt);
        if (answer == null) answer = "";

        // 11) Model kaynak üretirse temizle
        String answerForMemory = stripSourcesSection(answer).trim();

        // 12) User’a dönecek cevap (citations ON ise tek kaynak ekle)
        String answerToUser = answerForMemory;
        if (citationsEnabled) {
            answerToUser = appendSingleSource(answerToUser, usedMatches);
        }

        // 13) DB’ye yaz (assistant cevabı “Kaynak:” satırı olmadan)
        if (conversation != null) {
            conversationMemoryService.append(conversation, ConversationMessageRole.USER, userQuery);
            conversationMemoryService.append(conversation, ConversationMessageRole.ASSISTANT, answerForMemory);
        }

        return answerToUser.trim();
    }

    private Long resolveCurrentUserIdOrNull() {
        try {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || auth.getPrincipal() == null) return null;

            String principal = auth.getPrincipal().toString();
            if (principal == null || principal.isBlank()) return null;

            return Long.valueOf(principal);
        } catch (Exception e) {
            return null;
        }
    }

    private UserPreference resolveCurrentUserPreferenceOrNull() {
        try {
            Long userId = resolveCurrentUserIdOrNull();
            if (userId == null) return null;
            return userPreferenceService.getOrCreate(userId);
        } catch (Exception e) {
            return null;
        }
    }

    private String formatHistory(List<ConversationMessage> history) {
        if (history == null || history.isEmpty()) return "";
        StringBuilder sb = new StringBuilder();
        for (ConversationMessage m : history) {
            String role = (m.getRole() == ConversationMessageRole.USER) ? "Kullanıcı" : "Asistan";
            String content = (m.getContent() == null) ? "" : m.getContent().trim();

            // Prompt şişmesin diye basit bir kırpma (istersen limitleri arttırırız)
            if (content.length() > 1500) {
                content = content.substring(0, 1500) + " ...";
            }

            sb.append(role).append(": ").append(content).append("\n");
        }
        return sb.toString().trim();
    }

    private boolean isConversationMemoryQuery(String q) {
        if (q == null) return false;
        String s = q.toLowerCase();

        return s.contains("az önce") ||
                s.contains("daha önce") ||
                s.contains("ne demiştim") ||
                s.contains("ne demiştin") ||
                s.contains("ne söyledin") ||
                s.contains("ne söylemiştim") ||
                s.contains("hatırlıyor musun") ||
                s.contains("bir önceki mesaj") ||
                s.contains("önceki mesaj") ||
                s.contains("önceki cevabın") ||
                s.contains("bana ne cevap verdin") ||
                s.contains("bu konuşmada");
    }

    private String buildPreferenceAndEmotionPolicy(UserPreference pref, Emotion emotion) {

        Verbosity verbosity = (pref != null) ? pref.getVerbosity() : Verbosity.NORMAL;
        AnswerFormat format = (pref != null) ? pref.getFormat() : AnswerFormat.DEFAULT;
        Tone tone = (pref != null) ? pref.getTone() : Tone.SIMPLE;
        boolean citations = (pref != null) && pref.isCitations();

        StringBuilder sb = new StringBuilder();
        sb.append("Yanıt politikası:\n");
        sb.append("- Türkçe yaz.\n");
        sb.append("- BAĞLAM dışına çıkma, uydurma yapma.\n");
        sb.append("- Gereksiz tekrar yapma.\n");

        // Tone
        if (tone == Tone.TECHNICAL) {
            sb.append("- Ton: teknik ve net; doğru terimleri kullan.\n");
        } else {
            sb.append("- Ton: basit ve anlaşılır; jargon kullanma.\n");
        }

        // Emotion
        String e = (emotion != null) ? emotion.name() : "UNKNOWN";
        switch (e) {
            case "ANXIOUS" -> sb.append("- Duygu: endişeli. İstersen en fazla 1 kısa, sakinleştirici cümle ekle; sonra doğrudan bilgi ver.\n");
            case "ANGRY" -> sb.append("- Duygu: kızgın. Kısa, net ve çözüm odaklı yaz; gerilimi artırma.\n");
            case "SAD" -> sb.append("- Duygu: üzgün. Nazik ve destekleyici ol; abartılı terapötik söylem kullanma.\n");
            case "HAPPY" -> sb.append("- Duygu: mutlu. Olumlu ama abartısız yaz.\n");
            case "NEUTRAL" -> sb.append("- Duygu: nötr. Profesyonel ama sıcak, net bilgilendir.\n");
            default -> sb.append("- Duygu: bilinmiyor. Standart, kibar ve net yaz.\n");
        }
        sb.append("- Duygu cümlesi zorunlu değildir; gerekiyorsa sadece 1 cümle olsun.\n");

        // Verbosity
        if (verbosity == Verbosity.CONCISE) {
            sb.append("- Uzunluk: kısa. 2–3 cümle hedefle.\n");
        } else {
            sb.append("- Uzunluk: normal. 3–6 cümle aralığında kal.\n");
        }

        // Format
        if (format == AnswerFormat.STEP_BY_STEP) {
            sb.append("- Format: adım adım. Kısa numaralı adımlar kullan ('1)' formatında).\n");
            sb.append("- Adım numaraları yalnızca satır başında olmalı.\n");
        } else {
            sb.append("- Format: normal paragraf. Liste zorunlu değil.\n");
        }

        // Citations: modelden istemiyoruz; sistem ekliyor
        if (citations) {
            sb.append("- Kaynaklar: Yanıt içinde kaynak yazma; sistem en sonda otomatik tek kaynak ekleyecek.\n");
        } else {
            sb.append("- Kaynaklar: URL veya 'Kaynaklar' bölümü ekleme.\n");
        }

        return sb.toString();
    }

    private String stripSourcesSection(String answer) {
        if (answer == null) return "";

        String cleaned = answer.replaceAll("(?im)^\\s*Kaynaklar?\\s*:\\s*.*$", "");
        cleaned = cleaned.replaceAll("\\n{3,}", "\n\n");
        return cleaned.trim();
    }

    private String appendSingleSource(String answer, List<DocumentMatch> usedMatches) {
        String url = null;
        if (usedMatches != null && !usedMatches.isEmpty()) {
            url = (String) usedMatches.get(0).metadata().get("url");
        }

        if (url == null || url.isBlank()) {
            return answer + "\n\nKaynak: Kaynak belirtilmemiş";
        }

        return answer + "\n\nKaynak: " + url.trim();
    }
}
