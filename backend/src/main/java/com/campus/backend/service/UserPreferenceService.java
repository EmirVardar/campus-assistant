package com.campus.backend.service;

import com.campus.backend.dto.PreferenceTag;
import com.campus.backend.entity.AnswerFormat;
import com.campus.backend.entity.Tone;
import com.campus.backend.entity.UserPreference;
import com.campus.backend.entity.Verbosity;
import com.campus.backend.repository.UserPreferenceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class UserPreferenceService {

    private final UserPreferenceRepository repo;

    // Eşik mantığı (decay yok)
    private static final int TH_HIGH = 60;
    private static final int TH_LOW  = 40;
    private static final int STEP = 15; // bir feedback’in etkisi
    private static final int MIN = 0;
    private static final int MAX = 100;

    public UserPreference getOrCreate(Long userId) {
        return repo.findById(userId).orElseGet(() -> {
            UserPreference p = new UserPreference();
            p.setUserId(userId);
            p.setUpdatedAt(Instant.now());
            return repo.save(p);
        });
    }

    public UserPreference applyFeedback(Long userId, List<PreferenceTag> tags) {
        UserPreference p = getOrCreate(userId);

        if (tags == null || tags.isEmpty()) {
            return p; // değişiklik yok
        }

        for (PreferenceTag tag : tags) {
            switch (tag) {
                case KISA_ISTIYORUM -> p.setVerbosityScore(clamp(p.getVerbosityScore() + STEP));
                case NORMAL_ISTIYORUM -> p.setVerbosityScore(clamp(p.getVerbosityScore() - STEP));

                case KAYNAK_ISTIYORUM -> p.setCitationsScore(clamp(p.getCitationsScore() + STEP));
                case KAYNAK_ISTEMIYORUM -> p.setCitationsScore(clamp(p.getCitationsScore() - STEP));

                case ADIM_ADIM -> p.setFormatScore(clamp(p.getFormatScore() + STEP));
                case FORMAT_DEFAULT -> p.setFormatScore(clamp(p.getFormatScore() - STEP));

                case TEKNIK_ANLAT -> p.setToneScore(clamp(p.getToneScore() + STEP));
                case BASIT_ANLAT -> p.setToneScore(clamp(p.getToneScore() - STEP));
            }
        }

        // Skorlara göre “mod” kararı (histerezis: TH_HIGH/TH_LOW arası mevcut hali korur)
        p.setVerbosity(applyEnumByScore(p.getVerbosityScore(), p.getVerbosity(), Verbosity.CONCISE, Verbosity.NORMAL));
        p.setCitations(applyBoolByScore(p.getCitationsScore(), p.isCitations(), true, false));
        p.setFormat(applyEnumByScore(p.getFormatScore(), p.getFormat(), AnswerFormat.STEP_BY_STEP, AnswerFormat.DEFAULT));
        p.setTone(applyEnumByScore(p.getToneScore(), p.getTone(), Tone.TECHNICAL, Tone.SIMPLE));

        p.setUpdatedAt(Instant.now());
        return repo.save(p);
    }

    private int clamp(int v) {
        if (v < MIN) return MIN;
        if (v > MAX) return MAX;
        return v;
    }

    private boolean applyBoolByScore(int score, boolean current, boolean highValue, boolean lowValue) {
        if (score >= TH_HIGH) return highValue;
        if (score <= TH_LOW) return lowValue;
        return current;
    }

    private <T> T applyEnumByScore(int score, T current, T highValue, T lowValue) {
        if (score >= TH_HIGH) return highValue;
        if (score <= TH_LOW) return lowValue;
        return current;
    }
}
