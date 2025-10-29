package com.campus.backend.repository;

import com.campus.backend.entity.EmbeddingsMap;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmbeddingsMapRepository extends JpaRepository<EmbeddingsMap, Long> {
    boolean existsByVectorId(String vectorId);
    boolean existsByKindAndRecordId(String kind, Long recordId);
}
