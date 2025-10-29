package com.campus.backend.dto;

import java.time.Instant;

public record AnnouncementDTO(
        Long id,
        String title,
        String content,
        String url,
        String category,
        Instant publishedAt
) {}

