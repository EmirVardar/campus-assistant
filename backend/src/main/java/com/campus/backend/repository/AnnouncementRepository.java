package com.campus.backend.repository;

import com.campus.backend.entity.Announcement;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor; // <-- BU IMPORT'U EKLEYİN
import java.util.Optional;

//                                                                      ↓ VE BU KISMI EKLEYİN
public interface AnnouncementRepository extends JpaRepository<Announcement, Long>, JpaSpecificationExecutor<Announcement> {

    // Bu metod planınızın 1.6 adımında vardı (ETL servisi için gerekli)
    Optional<Announcement> findBySourceIdAndExternalId(Integer sourceId, String externalId);

}
