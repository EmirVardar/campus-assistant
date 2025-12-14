package com.campus.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Entity
@Data
@Table(name = "user_preferences")
public class UserPreference {

    @Id
    @Column(name = "user_id")
    private Long userId;

    // “Öğrenme” etkisi: score birikir, decay yok (senin isteğin)
    @Column(nullable = false)
    private int verbosityScore = 50;

    @Column(nullable = false)
    private int citationsScore = 50;

    @Column(nullable = false)
    private int formatScore = 50;

    @Column(nullable = false)
    private int toneScore = 50;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Verbosity verbosity = Verbosity.NORMAL;

    @Column(nullable = false)
    private boolean citations = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private AnswerFormat format = AnswerFormat.DEFAULT;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Tone tone = Tone.SIMPLE;

    @Column(nullable = false)
    private Instant updatedAt = Instant.now();
}
