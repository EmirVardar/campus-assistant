package com.campus.backend.dto;

import java.time.Instant;

public record CreateAnnouncementDTO(
        String title,
        String content,
        String url,
        String category,
        Instant publishedAt
) {}

