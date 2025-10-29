package com.campus.backend.controller;

import com.campus.backend.dto.AnnouncementDTO;             // DTO yolunuz
import com.campus.backend.entity.Announcement;            // Entity yolunuz
import com.campus.backend.mapper.AnnouncementMapper;      // Mapper yolunuz
import com.campus.backend.repository.AnnouncementRepository;
import com.campus.backend.repository.AnnouncementSpecs;   // Az önce oluşturduğumuz sınıf
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/announcements")
@RequiredArgsConstructor
public class AnnouncementController {

    private final AnnouncementRepository repo;
    private final AnnouncementMapper mapper; // Planınızın 2. adımındaki Mapper

    @GetMapping
    public Page<AnnouncementDTO> list(
            @RequestParam(required = false) String cat, // Opsiyonel ?cat=...
            @RequestParam(required = false) String q,   // Opsiyonel ?q=...
            Pageable pageable                           // Otomatik ?page=0&size=10&sort=...
    ) {
        // 1. Kriterleri birleştir
        Specification<Announcement> spec = AnnouncementSpecs.hasCategory(cat)
                .and(AnnouncementSpecs.textLike(q));

        // 2. Veritabanında dinamik sorguyu çalıştır
        return repo.findAll(spec, pageable)
                .map(mapper::toDto); // 3. Sonuçları DTO'ya çevir
    }
}
