package com.campus.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.ToString;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class VoiceResponse {
    private String answer;

    @ToString.Exclude
    private String audioBase64;

    private Emotion emotion;

    private String ttsText; // <-- YENİ
}
