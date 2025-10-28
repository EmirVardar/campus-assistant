// YENİ HALİ (DOĞRU)
package com.campus.backend.controller;

import dev.langchain4j.model.chat.ChatLanguageModel;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

// 1. ADIM: Gelen JSON'ı karşılamak için bir 'record' tanımladık.
// React Native'den gelecek {"message": "..."} objesi buna dönüşecek.
// Bunu sınıfın DIŞINA, ama aynı dosyaya koyabilirsin.
record ChatRequest(String message) {}

@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final ChatLanguageModel chatModel;

    @GetMapping("/ping")
    public String ping() {
        return chatModel.generate("You are a concise assistant. Reply with a one-line greeting.");
    }

    // 2. ADIM: Metodun imzasını güncelledik
    @PostMapping(value = "/chat") // <-- 'consumes = "text/plain"' kısmını SİLDİK.
    // Artık varsayılan olarak JSON (application/json) kabul edecek.
    public String chat(@RequestBody ChatRequest request) { // <-- Parametreyi 'String userMessage' yerine 'ChatRequest request' yaptık.
        // Spring Boot gelen JSON'ı otomatik olarak bu objeye dolduracak.

        // 3. ADIM: Mesajı 'request' objesinden aldık.
        return chatModel.generate(request.message());
    }
}