package com.campus.backend.dto;

import lombok.Data;

import java.util.List;

@Data
public class PreferenceFeedbackRequest {
    private List<PreferenceTag> tags;
}
