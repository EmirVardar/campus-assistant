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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class AiService {

    private final EmbeddingService embeddingService;
    private final ChatLanguageModel chatModel;
    private final UserPreferenceService userPreferenceService;
    private final ConversationMemoryService conversationMemoryService;

    private final Resource ragPromptResource;
    private String promptTemplate;

    private static final double RELEVANCE_THRESHOLD = 0.75;
    private static final int HISTORY_LIMIT = 10;
    private static final String DEFAULT_CONVERSATION_KEY = "default";

    // ✅ Modelin döndürdüğü kaynak satırını yakalamak için
    private static final Pattern USED_SOURCE_PATTERN =
            Pattern.compile("(?im)^\\s*KULLANILAN_KAYNAK\\s*:\\s*(S\\d+|YOK)\\s*$");

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

        Long userId = resolveCurrentUserIdOrNull();
        Conversation conversation = null;
        String historyBlock = "";

        if (userId != null) {
            conversation = conversationMemoryService.getOrCreate(userId, DEFAULT_CONVERSATION_KEY);
            var history = conversationMemoryService.getLastMessages(conversation.getId(), HISTORY_LIMIT);
            historyBlock = formatHistory(history);
        }

        UserPreference pref = resolveCurrentUserPreferenceOrNull();
        boolean citationsEnabled = (pref != null) && pref.isCitations();

        // 1) Konuşma hafızası soruları
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

            String cleanedForUser = stripInternalAndSources(answerRaw).trim();

            if (conversation != null) {
                conversationMemoryService.append(conversation, ConversationMessageRole.USER, userQuery);
                conversationMemoryService.append(conversation, ConversationMessageRole.ASSISTANT, cleanedForUser);
            }

            return cleanedForUser;
        }

        // 2) RAG
        List<DocumentMatch> matches = embeddingService.findRelevantDocuments(userQuery, 8);

        boolean hasRelevant = matches != null && matches.stream()
                .anyMatch(m -> m != null && m.distance() <= RELEVANCE_THRESHOLD);

        if (!hasRelevant) {
            String fallback =
                    "Bu soru için duyurularda net bir bilgi bulamadım. " +
                            "Eğer duyurunun başlığını veya linkini paylaşırsan birlikte kesinleştirebilirim.";

            if (conversation != null) {
                conversationMemoryService.append(conversation, ConversationMessageRole.USER, userQuery);
                conversationMemoryService.append(conversation, ConversationMessageRole.ASSISTANT, fallback);
            }
            return fallback;
        }

        // ✅ 3) Prompt’a yalnızca threshold altı duyuruları koy (sapmayı azaltır)
        List<DocumentMatch> usedForPrompt = matches.stream()
                .filter(m -> m != null && m.distance() <= RELEVANCE_THRESHOLD)
                .collect(Collectors.toList());

        if (usedForPrompt.isEmpty()) {
            // fallback: en iyi 2 duyuru
            usedForPrompt = matches.stream().filter(m -> m != null).limit(2).collect(Collectors.toList());
        }

        // 4) Context: SOURCE_ID ile ver
        String context = buildContextWithSourceIds(usedForPrompt);

        String preferencePolicy = buildPreferenceAndEmotionPolicy(pref, emotion)
                + "\n- Not: Konuşma geçmişi diyaloğu sürdürmek içindir; BAĞLAM ise referans bilgidir.\n"
                + "- BAĞLAM'ı kelimesi kelimesine kopyalama; sadeleştirip yorumlayarak anlat.\n";

        String emotionValue = (emotion != null) ? emotion.name() : "UNKNOWN";
        String ragPrompt = String.format(this.promptTemplate, context, emotionValue, userQuery);

        String finalPrompt =
                preferencePolicy + "\n\n" +
                        "KONUŞMA GEÇMİŞİ (bağlam):\n" +
                        (historyBlock.isBlank() ? "(Geçmiş yok)\n" : historyBlock + "\n") +
                        "\n" + ragPrompt;

        String rawAnswer = chatModel.generate(finalPrompt);
        if (rawAnswer == null) rawAnswer = "";

        // ✅ 5) Modelin seçtiği SOURCE_ID’yi yakala
        String usedSourceId = extractUsedSourceId(rawAnswer); // S1, S2, ... veya YOK

        // ✅ 6) Kullanıcıya gösterilecek metni temizle (internal + kaynak satırları)
        String answerForUser = stripInternalAndSources(rawAnswer).trim();

        // ✅ 7) Doğru linki bas (citationsEnabled ise)
        if (citationsEnabled) {
            String url = resolveUrlBySourceId(usedSourceId, usedForPrompt);
            answerForUser = appendResolvedSource(answerForUser, url);
        }

        // ✅ 8) DB’ye kaydet (temiz hali)
        if (conversation != null) {
            conversationMemoryService.append(conversation, ConversationMessageRole.USER, userQuery);
            conversationMemoryService.append(conversation, ConversationMessageRole.ASSISTANT, answerForUser);
        }

        return answerForUser;
    }

    // ---- SOURCE_ID helpers ----

    private String buildContextWithSourceIds(List<DocumentMatch> matches) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < matches.size(); i++) {
            DocumentMatch m = matches.get(i);
            String sid = "S" + (i + 1);

            String url = "";
            String title = "";
            try {
                Object u = (m.metadata() != null) ? m.metadata().get("url") : null;
                url = (u != null) ? u.toString() : "";
                Object t = (m.metadata() != null) ? m.metadata().get("title") : null;
                title = (t != null) ? t.toString() : "";
            } catch (Exception ignored) {}

            String text = (m.text() == null) ? "" : m.text().trim();
            if (text.length() > 2500) text = text.substring(0, 2500) + " ...";

            sb.append("SOURCE_ID: ").append(sid).append("\n");
            if (!title.isBlank()) sb.append("TITLE: ").append(title).append("\n");
            sb.append("URL: ").append(url).append("\n");
            sb.append("TEXT:\n").append(text).append("\n");

            if (i < matches.size() - 1) sb.append("\n---\n\n");
        }
        return sb.toString();
    }

    private String extractUsedSourceId(String rawAnswer) {
        Matcher m = USED_SOURCE_PATTERN.matcher(rawAnswer);
        if (m.find()) {
            return m.group(1).trim(); // S2 veya YOK
        }
        // Model bazen satırı unutabilir; bu durumda null dön
        return null;
    }

    private String resolveUrlBySourceId(String sourceId, List<DocumentMatch> usedForPrompt) {
        if (sourceId == null || sourceId.isBlank()) return null;
        if ("YOK".equalsIgnoreCase(sourceId.trim())) return null;

        // S# -> index
        int idx;
        try {
            idx = Integer.parseInt(sourceId.substring(1)) - 1;
        } catch (Exception e) {
            return null;
        }

        if (idx < 0 || idx >= usedForPrompt.size()) return null;

        try {
            Object u = usedForPrompt.get(idx).metadata().get("url");
            String url = (u != null) ? u.toString() : null;
            if (url == null || url.isBlank()) return null;
            return url.trim();
        } catch (Exception e) {
            return null;
        }
    }

    private String appendResolvedSource(String answer, String url) {
        if (url == null || url.isBlank()) {
            return answer + "\n\nKaynak: Kaynak belirtilmemiş";
        }
        return answer + "\n\nKaynak: " + url.trim();
    }

    // ---- other helpers ----

    private Long resolveCurrentUserIdOrNull() {
        try {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || auth.getPrincipal() == null) return null;

            String principal = auth.getPrincipal().toString();
            if (principal.isBlank()) return null;

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
            if (content.length() > 600) content = content.substring(0, 600) + " ...";
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
        sb.append("- BAĞLAM ile çelişme; ancak BAĞLAM'ı aynen kopyalama, sadeleştirip yorumlayarak anlat.\n");
        sb.append("- Gereksiz tekrar yapma.\n");

        sb.append("- Konuşma geçmişini diyaloğu sürdürmek için kullan: kullanıcının önceki niyetini, verdiği detayları hatırla.\n");
        sb.append("- Konuşma geçmişindeki bilgiler BAĞLAM ile çelişirse BAĞLAM'ı esas al ve bunu kibarca belirt.\n");
        sb.append("- Kullanıcı geçmişte bölüm/sınıf/tarih/ders adı gibi bilgi verdiyse cevapta dikkate al.\n");
        sb.append("- Gerekli bilgi yoksa 1 netleştirici soru sor.\n");

        if (tone == Tone.TECHNICAL) {
            sb.append("- Ton: teknik ve net; doğru terimleri kullan.\n");
        } else {
            sb.append("- Ton: basit ve anlaşılır; jargon kullanma.\n");
        }

        String e = (emotion != null) ? emotion.name() : "UNKNOWN";
        switch (e) {
            case "ANXIOUS" -> sb.append("- Duygu: endişeli. En fazla 1 kısa, sakinleştirici cümle ekleyebilirsin; sonra bilgi ver.\n");
            case "ANGRY" -> sb.append("- Duygu: kızgın. Kısa, net ve çözüm odaklı yaz; gerilimi artırma.\n");
            case "SAD" -> sb.append("- Duygu: üzgün. Nazik ve destekleyici ol; terapötik söylem kullanma.\n");
            case "HAPPY" -> sb.append("- Duygu: mutlu. Olumlu ama abartısız yaz.\n");
            case "NEUTRAL" -> sb.append("- Duygu: nötr. Profesyonel ama sıcak, net bilgilendir.\n");
            default -> sb.append("- Duygu: bilinmiyor. Standart, kibar ve net yaz.\n");
        }
        sb.append("- Duygu cümlesi zorunlu değildir; gerekiyorsa sadece 1 cümle olsun.\n");

        if (verbosity == Verbosity.CONCISE) {
            sb.append("- Uzunluk: kısa. 2–3 cümle hedefle.\n");
        } else {
            sb.append("- Uzunluk: normal. 3–6 cümle aralığında kal.\n");
        }

        if (format == AnswerFormat.STEP_BY_STEP) {
            sb.append("- Format: adım adım. Kısa numaralı adımlar kullan ('1)' formatında).\n");
            sb.append("- Adım numaraları yalnızca satır başında olmalı.\n");
        } else {
            sb.append("- Format: normal paragraf. Liste zorunlu değil.\n");
        }

        if (citations) {
            sb.append("- Kaynaklar: Yanıt içinde kaynak yazma; sistem en sonda otomatik tek kaynak ekleyecek.\n");
        } else {
            sb.append("- Kaynaklar: URL veya 'Kaynaklar' bölümü ekleme.\n");
        }

        return sb.toString();
    }

    // ✅ Kullanıcıya gösterilmeyecek satırları temizler:
    // - KULLANILAN_KAYNAK: ...
    // - Kaynak: ... (model yazarsa)
    private String stripInternalAndSources(String answer) {
        if (answer == null) return "";

        String cleaned = answer.replaceAll("(?im)^\\s*KULLANILAN_KAYNAK\\s*:\\s*(S\\d+|YOK)\\s*$", "");
        cleaned = cleaned.replaceAll("(?im)^\\s*Kaynaklar?\\s*:\\s*.*$", "");
        cleaned = cleaned.replaceAll("(?im)^\\s*Kaynak\\s*:\\s*.*$", "");
        cleaned = cleaned.replaceAll("\\n{3,}", "\n\n");
        return cleaned.trim();
    }
}
