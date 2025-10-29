package com.campus.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Entity
@Data
@Table(
        name = "announcements",
        uniqueConstraints = @UniqueConstraint(columnNames = {"source_id","externalId"}),
        indexes = {
                @Index(columnList = "publishedAt"),
                @Index(columnList = "category")
        }
)
public class Announcement {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_id", nullable = false)
    private Source source;

    @Column(nullable = false, length = 256)
    private String externalId;

    @Column(nullable = false, columnDefinition = "text")
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    private String url;
    private String category;

    private Instant publishedAt;

    @Column(nullable = false)
    private Instant scrapedAt;

    @Column(length = 8)
    private String lang;

    @PrePersist
    void prePersist() {
        if (scrapedAt == null) scrapedAt = Instant.now();
        if (lang == null) lang = "tr";
    }
}
