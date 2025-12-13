package com.campus.backend.controller;

import com.campus.backend.dto.VoiceResponse;
import com.campus.backend.dto.Emotion;
import com.campus.backend.service.AiService;
import com.campus.backend.service.OpenAiAudioService;
import com.campus.backend.service.EmotionService;
import com.campus.backend.service.TtsTextSanitizer;

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
    private final AiService aiService;
    private final EmotionService emotionService;
    private final TtsTextSanitizer ttsTextSanitizer;

    public VoiceController(OpenAiAudioService audioService,
                           AiService aiService,
                           EmotionService emotionService,
                           TtsTextSanitizer ttsTextSanitizer) {
        this.audioService = audioService;
        this.aiService = aiService;
        this.emotionService = emotionService;
        this.ttsTextSanitizer = ttsTextSanitizer;
    }

    @PostMapping(value = "/ask", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<VoiceResponse> askWithVoice(@RequestParam("file") MultipartFile file) throws IOException {

        // 1) Ses -> Metin
        String userQuestion = audioService.transcribe(file);

        // 2) Metin -> Duygu
        Emotion emotion = emotionService.detectEmotion(userQuestion);

        // 3) Soru + Duygu -> Cevap (RAG + AI)  -> UI'ya aynen dönecek
        String aiAnswer = aiService.getAiResponse(userQuestion, emotion);

        // ✅ 4) TTS'ye giden metni temizle (link/kaynak okunmasın)
        String ttsText = ttsTextSanitizer.sanitize(aiAnswer);

        // 5) Temiz metni sese çevir
        byte[] audioBytes = audioService.synthesize(ttsText);
        String base64Audio = Base64.getEncoder().encodeToString(audioBytes);

        // 6) Text + Ses + Emotion döndür (answer linkli olabilir, ses linksiz olacak)
        return ResponseEntity.ok(new VoiceResponse(aiAnswer, base64Audio, emotion));
    }
}
