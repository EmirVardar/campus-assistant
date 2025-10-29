package com.campus.backend.entity;

import jakarta.persistence.*;
import lombok.Data;


import java.time.Instant;

@Entity
@Data
@Table(name = "etl_jobs")
public class EtlJob {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String jobName;      // ör: pull_muys

    @Column(nullable = false)
    private String status;       // STARTED, SUCCESS, FAILED

    @Column(nullable = false)
    private Instant startedAt;

    private Instant finishedAt;

    private Integer itemCount = 0;

    @Column(columnDefinition = "text")
    private String message;

    @PrePersist
    void prePersist() {
        if (startedAt == null) startedAt = Instant.now();
        if (status == null) status = "STARTED";
        if (itemCount == null) itemCount = 0;
    }
}
