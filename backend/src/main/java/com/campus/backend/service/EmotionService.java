package com.campus.backend.service;

import com.campus.backend.dto.Emotion;
import dev.langchain4j.model.chat.ChatLanguageModel;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
@RequiredArgsConstructor
public class EmotionService {

    private final ChatLanguageModel chatModel;

    /**
     * Kullanıcının kısa cümle / sorusundan duygusal durumu tahmin eder.
     * Çıktı: HAPPY, SAD, ANGRY, ANXIOUS, NEUTRAL
     */
    public Emotion detectEmotion(String userUtterance) {
        if (userUtterance == null || userUtterance.isBlank()) {
            return Emotion.UNKNOWN;
        }

        String prompt = """
                Aşağıdaki kullanıcı cümlesinin duygusal durumunu etiketle.
                Kullanıcı Türkçe veya İngilizce konuşabilir.

                Sadece şu etiketlerden BİRİNİ döndür:
                HAPPY, SAD, ANGRY, ANXIOUS, NEUTRAL

                Ekstra açıklama, cümle veya sembol yazma.
                Sadece etiketi yaz.

                Kullanıcı cümlesi:
                "%s"
                """.formatted(userUtterance);

        String raw = chatModel.generate(prompt)//tahmin burada yapışıyor
                .trim()
                .toUpperCase(Locale.ROOT);

        try {
            return Emotion.valueOf(raw);
        } catch (IllegalArgumentException e) {
            return Emotion.UNKNOWN;
        }
    }
}
