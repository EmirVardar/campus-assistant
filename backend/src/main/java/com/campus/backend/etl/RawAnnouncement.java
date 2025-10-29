package com.campus.backend.etl;

import java.time.Instant;

public record RawAnnouncement(
        String externalId,
        String title,
        String htmlContent,
        String url,
        String category,
        Instant publishedAt
) {}
