package com.campus.backend.controller;

import com.campus.backend.dto.VoiceResponse;        // 2. Adımda oluşturduğumuz DTO
import com.campus.backend.service.AiService;        // SENİN MEVCUT BEYNİN (LangChain)
import com.campus.backend.service.OpenAiAudioService; // YENİ DUYULARIN (Whisper + TTS)
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Base64;

@RestController
@RequestMapping("/api/voice")
public class VoiceController {

    private final OpenAiAudioService audioService;
    private final AiService aiService; // Senin RAG yapını buraya bağlıyoruz

    // Spring, iki servisi de otomatik olarak buraya getirecek
    public VoiceController(OpenAiAudioService audioService, AiService aiService) {
        this.audioService = audioService;
        this.aiService = aiService;
    }

    @PostMapping(value = "/ask", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<VoiceResponse> askWithVoice(@RequestParam("file") MultipartFile file) throws IOException {

        // 1. KULAK (STT): Gelen ses dosyasını yazıya çevir
        // "Sınavlar ne zaman?"
        String userQuestion = audioService.transcribe(file);

        // 2. BEYİN (LangChain): Senin mevcut zekana bu soruyu sor
        // "Sınavlar 20 Kasım'da başlıyor."
        String aiAnswer = aiService.getAiResponse(userQuestion);

        // 3. AĞIZ (TTS): Zekadan gelen metni tekrar sese çevir
        byte[] audioBytes = audioService.synthesize(aiAnswer);

        // 4. PAKETLEME: Sesi JSON içinde göndermek için Base64 yapıyoruz
        String base64Audio = Base64.getEncoder().encodeToString(audioBytes);

        // 5. SONUÇ: Hem yazıyı hem sesi (hibrit) dönüyoruz
        return ResponseEntity.ok(new VoiceResponse(aiAnswer, base64Audio));
    }
}
