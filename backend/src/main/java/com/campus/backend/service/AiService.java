package com.campus.backend.service;

import com.campus.backend.dto.Emotion;
import com.campus.backend.entity.AnswerFormat;
import com.campus.backend.entity.Tone;
import com.campus.backend.entity.UserPreference;
import com.campus.backend.entity.Verbosity;
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

    private final Resource ragPromptResource;
    private String promptTemplate;

    private static final double RELEVANCE_THRESHOLD = 0.6;

    public AiService(
            EmbeddingService embeddingService,
            ChatLanguageModel chatModel,
            UserPreferenceService userPreferenceService,
            @Value("classpath:prompts/rag-template.txt") Resource ragPromptResource
    ) {
        this.embeddingService = embeddingService;
        this.chatModel = chatModel;
        this.userPreferenceService = userPreferenceService;
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

        // 0) Preference oku
        UserPreference pref = resolveCurrentUserPreferenceOrNull();
        boolean citationsEnabled = (pref != null) && pref.isCitations();

        // 1) RAG match
        List<DocumentMatch> matches = embeddingService.findRelevantDocuments(userQuery, 5);

        // 2) Guardrail
        if (matches.isEmpty() || matches.get(0).distance() > RELEVANCE_THRESHOLD) {
            return "Bu bilgi duyurularda geçmiyor. İstersen duyurunun başlığını veya linkini paylaşırsan birlikte netleştirebilirim.";
        }

        // ✅ 3) Citations açıksa tek duyuru kullan (tek kaynak doğru olsun)
        List<DocumentMatch> usedMatches = citationsEnabled ? matches.subList(0, 1) : matches;

        // 4) Context: duyuru metni (URL'leri prompt içine gömmüyoruz)
        String context = usedMatches.stream()
                .map(m -> "Duyuru: " + m.text())
                .collect(Collectors.joining("\n---\n"));

        // 5) Policy (preference + emotion)
        String preferencePolicy = buildPreferenceAndEmotionPolicy(pref, emotion);

        // 6) Template
        String emotionValue = (emotion != null) ? emotion.name() : "UNKNOWN";
        String ragPrompt = String.format(this.promptTemplate, context, emotionValue, userQuery);

        // 7) Final prompt
        String finalPrompt = preferencePolicy + "\n\n" + ragPrompt;

        // 8) Generate
        String answer = chatModel.generate(finalPrompt);
        if (answer == null) answer = "";

        // 9) Model kaynak üretirse çakışmasın diye temizle
        answer = stripSourcesSection(answer).trim();

        // ✅ 10) Citations ON ise tek kaynak ekle
        if (citationsEnabled) {
            answer = appendSingleSource(answer, usedMatches);
        }

        return answer.trim();
    }

    private UserPreference resolveCurrentUserPreferenceOrNull() {
        try {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || auth.getPrincipal() == null) return null;

            String principal = auth.getPrincipal().toString();
            if (principal == null || principal.isBlank()) return null;

            Long userId = Long.valueOf(principal);
            return userPreferenceService.getOrCreate(userId);
        } catch (Exception e) {
            return null;
        }
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

        // Emotion (yumuşak, opsiyonel)
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
            sb.append("- Format: adım adım. Kısa numaralı adımlar kullan (1) değil, '1)' formatında).\n");
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

        // Cevabın neresinde olursa olsun "Kaynak:" / "Kaynaklar:" satırlarını temizle
        String cleaned = answer.replaceAll("(?im)^\\s*Kaynaklar?\\s*:\\s*.*$", "");

        // Boş satırları toparla
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
