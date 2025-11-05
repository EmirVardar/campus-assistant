package com.campus.backend.service;

import com.campus.backend.vector.DocumentMatch; // Yeni oluşturduğumuz record
import com.campus.backend.vector.EmbeddingService; // Az önce güncellediğimiz servis
import dev.langchain4j.model.chat.ChatLanguageModel; // AiConfig'den gelen bean
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import com.campus.backend.vector.DocumentMatch;
import com.campus.backend.vector.EmbeddingService;
import dev.langchain4j.model.chat.ChatLanguageModel;
// @RequiredArgsConstructor'ı sildik, manuel constructor ekleyeceğiz
import org.springframework.stereotype.Service;

// ----- YENİ IMPORT'LAR -----
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.util.FileCopyUtils;
import jakarta.annotation.PostConstruct;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
// ----- YENİ IMPORT'LAR BİTTİ -----

import java.util.List;
import java.util.stream.Collectors;

@Service
// @RequiredArgsConstructor // <-- SİLİNDİ
public class AiService {

    private final EmbeddingService embeddingService;
    private final ChatLanguageModel chatModel;

    // ----- YENİ ALANLAR (Prompt'u dosyadan okumak için) -----
    private final Resource ragPromptResource; // Dosyayı tutacak
    private String promptTemplate; // Dosyadan okunan metni tutacak
    // ----- YENİ ALANLAR BİTTİ -----


    /**
     * Sprint 4: Prompt Şablonu (SABİT METNİ SİLDİK)
     */
    // private static final String PROMPT_TEMPLATE = "..."; // <-- BU BLOK SİLİNDİ


    private static final double RELEVANCE_THRESHOLD = 0.6;

    // ----- YENİ CONSTRUCTOR -----
    // @RequiredArgsConstructor'ı sildiğimiz için bu constructor'ı ekliyoruz
    // Spring, bu constructor'ı kullanarak bağımlılıkları ve prompt dosyasını inject edecek
    public AiService(
            EmbeddingService embeddingService,
            ChatLanguageModel chatModel,
            @Value("classpath:prompts/rag-template.txt") Resource ragPromptResource // Dosyayı inject et
    ) {
        this.embeddingService = embeddingService;
        this.chatModel = chatModel;
        this.ragPromptResource = ragPromptResource;
    }

    // ----- YENİ METOT: @PostConstruct -----
    // Bu metot, AiService oluşturulduktan hemen sonra çalışır
    // ve prompt dosyasını okuyup 'promptTemplate' değişkenine atar.
    @PostConstruct
    public void init() {
        try (InputStreamReader reader = new InputStreamReader(ragPromptResource.getInputStream(), StandardCharsets.UTF_8)) {
            this.promptTemplate = FileCopyUtils.copyToString(reader);
        } catch (IOException e) {
            throw new UncheckedIOException("Prompt dosyası okunamadı: " + ragPromptResource, e);
        }
    }
    // ----- YENİ METOT BİTTİ -----


    /**
     * RAG zincirini çalıştıran ana metot.
     * @param userQuery Kullanıcının sorduğu soru.
     * @return Yapay zekadan gelen cevap.
     */
    public String getAiResponse(String userQuery) {

        // 1. "Embedding'lerden en alakalı 5 kaydın çekilmesi"
        List<DocumentMatch> matches = embeddingService.findRelevantDocuments(userQuery, 5);

        // 2. GUARDRAIL BLOĞU
        if (matches.isEmpty() || matches.get(0).distance() > RELEVANCE_THRESHOLD) {
            return "Bu konuda bilgim bulunuyor. Lütfen sorunuzu duyurular veya öğrenci bilgileriyle ilgili olacak şekilde sorun.";
        }

        // 3. Context oluşturma
        String context = matches.stream()
                .map(match -> {
                    String text = match.text();
                    String url = (String) match.metadata().getOrDefault("url", "Kaynak belirtilmemiş");
                    return String.format("Duyuru: %s (Kaynak: %s)", text, url);
                })
                .collect(Collectors.joining("\n---\n"));

        // 4. Prompt Şablonunu context ve kullanıcı sorusuyla doldur
        // DEĞİŞİKLİK: 'PROMPT_TEMPLATE' yerine 'this.promptTemplate' (dosyadan okunan) kullan
        String finalPrompt = String.format(this.promptTemplate, context, userQuery);

        // 5. Zincirin son adımı
        return chatModel.generate(finalPrompt);
    }
}