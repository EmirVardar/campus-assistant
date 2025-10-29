package com.campus.backend.repository;

import com.campus.backend.entity.EtlJob;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EtlJobRepository extends JpaRepository<EtlJob, Long> {
}
