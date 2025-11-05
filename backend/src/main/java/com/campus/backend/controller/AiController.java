// YENİ HALİ (DOĞRU)
package com.campus.backend.controller;

// GEREKLİ IMPORT'LAR
import com.campus.backend.dto.ChatRequest;    // Adım 4.4'te oluşturduk
import com.campus.backend.dto.ChatResponse;   // Adım 4.4'te oluşturduk
import com.campus.backend.service.AiService;  // Adım 4.3'te oluşturduk
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/ai") // Senin projen /api/ai kullanıyorsa /api/v1/ai olarak güncelleyebilirsin
@RequiredArgsConstructor
public class AiController {

    // 1. ADIM: Artık 'ChatLanguageModel' DEĞİL, 'AiService' (RAG Zinciri) inject ediliyor
    private final AiService aiService;

    /**
     * Sprint 4: RAG Chat Endpoint'i
     * @param request Kullanıcının sorusunu içeren JSON body ({ "query": "..." })
     * @return Yapay zekanın RAG ile ürettiği cevap ({ "answer": "..." })
     */
    @PostMapping("/chat")
    public ResponseEntity<ChatResponse> chatWithRag(@RequestBody ChatRequest request) {

        // 2. ADIM: İstek, 'AiService' (RAG zincirimiz) içindeki 'getAiResponse' metoduna yönlendiriliyor
        // Artık 'chatModel.generate' ÇAĞIRMIYORUZ.
        String response = aiService.getAiResponse(request.getQuery());

        // 3. ADIM: Cevabı 'ChatResponse' DTO'su ile paketliyoruz
        return ResponseEntity.ok(new ChatResponse(response));
    }
}