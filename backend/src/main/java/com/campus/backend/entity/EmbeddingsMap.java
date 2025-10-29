package com.campus.backend.entity;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Entity
@Data
@Table(
        name = "embeddings_map",
        uniqueConstraints = @UniqueConstraint(columnNames = {"kind","recordId"}),
        indexes = @Index(columnList = "vectorId", unique = true)
)
public class EmbeddingsMap {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 16)
    private String kind;        // "announcement" | "faq"

    @Column(nullable = false)
    private Long recordId;

    @Column(nullable = false, length = 128)
    private String vectorId;    // Chroma id (örn: ann_123)

    @Column(nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }
}
