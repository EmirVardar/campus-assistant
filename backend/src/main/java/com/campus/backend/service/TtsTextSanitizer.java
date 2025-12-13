package com.campus.backend.service;

import org.springframework.stereotype.Service;

@Service
public class TtsTextSanitizer {

    public String sanitize(String text) {
        String cleaned = text;

        // 1) "Kaynak" geçen satırı (Kaynak:, Kaynaklar:, Kaynak : vb.) ve sonrasını tamamen kaldır
        cleaned = cleaned.replaceAll("(?is)\\n?\\s*Kaynak\\S*\\s*:?\\s*.*$", "").trim();

        // 2) Metin içinde URL kaldıysa sil
        cleaned = cleaned.replaceAll("https?://\\S+", "").trim();

        // 3) Fazla boşlukları toparla
        cleaned = cleaned.replaceAll("[ \\t]{2,}", " ");
        cleaned = cleaned.replaceAll("\\n{3,}", "\n\n");

        return cleaned.trim();
    }
}
