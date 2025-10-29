package com.campus.backend.repository;

import com.campus.backend.entity.Announcement; // Entity yolunuz
import org.springframework.data.jpa.domain.Specification;
import jakarta.persistence.criteria.Root; // Spring Boot 3 / Jakarta için
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Predicate;

public class AnnouncementSpecs {

    // Kategoriye göre filtreleme
    public static Specification<Announcement> hasCategory(String cat) {
        return (Root<Announcement> r, CriteriaQuery<?> q, CriteriaBuilder cb) -> {
            if (cat == null || cat.isBlank()) {
                return cb.conjunction(); // Parametre yoksa hiçbir şey yapma
            }
            return cb.equal(r.get("category"), cat);
        };
    }

    // Başlık VEYA içerikte metin arama (küçük/büyük harf duyarsız)
    public static Specification<Announcement> textLike(String qstr) {
        return (Root<Announcement> r, CriteriaQuery<?> q, CriteriaBuilder cb) -> {
            if (qstr == null || qstr.isBlank()) {
                return cb.conjunction(); // Parametre yoksa hiçbir şey yapma
            }
            String like = "%" + qstr.toLowerCase() + "%";

            Predicate titleLike = cb.like(cb.lower(r.get("title")), like);
            Predicate contentLike = cb.like(cb.lower(r.get("content")), like);

            return cb.or(titleLike, contentLike); // title VEYA content
        };
    }
}