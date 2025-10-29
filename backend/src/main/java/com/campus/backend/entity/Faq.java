package com.campus.backend.entity;

import jakarta.persistence.*;
import lombok.Data;


import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Data
@Table(name = "faq")
public class Faq {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, columnDefinition = "text")
    private String question;

    @Column(nullable = false, columnDefinition = "text")
    private String answer;

    @ElementCollection
    @CollectionTable(name = "faq_tags", joinColumns = @JoinColumn(name = "faq_id"))
    @Column(name = "tag", length = 64)
    private List<String> tags = new ArrayList<>();

    @Column(nullable = false)
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (updatedAt == null) updatedAt = Instant.now();
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = Instant.now();
    }
}

