package com.campus.backend.dto;

import lombok.Data;

@Data
public class EmotionPredictResponse {
    private String emotion;
    private Double confidence;
}
