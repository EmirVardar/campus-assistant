package com.campus.backend.dto;

import com.campus.backend.entity.AnswerFormat;
import com.campus.backend.entity.Tone;
import com.campus.backend.entity.Verbosity;
import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class UserPreferenceResponse {
    private Long userId;

    private Verbosity verbosity;
    private boolean citations;
    private AnswerFormat format;
    private Tone tone;

    // Debug için skorları da dönüyoruz (istersen sonra kaldırırız)
    private int verbosityScore;
    private int citationsScore;
    private int formatScore;
    private int toneScore;
}
