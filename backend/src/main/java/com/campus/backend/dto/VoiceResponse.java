package com.campus.backend.dto;

public record VoiceResponse(
        String answerText,      // Ekranda görünecek yazı
        String audioBase64      // Çalınacak ses verisi
) {}
