package com.campus.backend.service;

import com.campus.backend.dto.Emotion;
import com.campus.backend.dto.EmotionPredictRequest;
import com.campus.backend.dto.EmotionPredictResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
@RequiredArgsConstructor
public class EmotionService {

    private final RestClient restClient;

    @Value("${app.emotion.url:http://127.0.0.1:8099/predict}")
    private String emotionUrl;

    public Emotion detectEmotion(String userUtterance) {
        if (userUtterance == null || userUtterance.isBlank()) {
            return Emotion.UNKNOWN;
        }

        try {
            EmotionPredictResponse resp = restClient.post()
                    .uri(emotionUrl)
                    .body(new EmotionPredictRequest(userUtterance))
                    .retrieve()
                    .body(EmotionPredictResponse.class);

            if (resp == null || resp.getEmotion() == null || resp.getEmotion().isBlank()) {
                return Emotion.UNKNOWN;
            }

            String label = resp.getEmotion().trim().toUpperCase();
            return Emotion.valueOf(label);

        } catch (Exception e) {
            return Emotion.UNKNOWN;
        }
    }
}
