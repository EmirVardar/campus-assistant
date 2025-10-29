package com.campus.backend.repository;

import com.campus.backend.entity.Source;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SourceRepository extends JpaRepository<Source, Integer> {
    Optional<Source> findByCode(String code);
}
