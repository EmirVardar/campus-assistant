package com.campus.backend.service;

import com.campus.backend.entity.Announcement;
import com.campus.backend.vector.EmbeddingService;
import com.campus.backend.entity.EtlJob;
import com.campus.backend.entity.Source;
import com.campus.backend.etl.AnnouncementClient;
import com.campus.backend.etl.HtmlCleaner;
import com.campus.backend.repository.AnnouncementRepository;
import com.campus.backend.repository.EtlJobRepository;
import com.campus.backend.repository.FaqRepository;
import com.campus.backend.repository.SourceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class EtlService {

    private final SourceRepository sourceRepo;
    private final AnnouncementRepository annRepo;
    private final FaqRepository faqRepo;                 // şimdilik kullanılmıyor; ileride FAQ ETL
    private final EmbeddingService embeddingService;     // Chroma index
    private final HtmlCleaner cleaner;
    private final EtlJobRepository jobRepo;

    @Transactional
    public Map<String, Object> pull(AnnouncementClient client) {
        EtlJob job = new EtlJob();
        job.setJobName("pull_" + client.getSourceCode());
        job.setStatus("STARTED");
        jobRepo.save(job);

        int inserted = 0;

        try {
            // 1) Kaynağı garanti et (yoksa yarat)
            Source src = sourceRepo.findByCode(client.getSourceCode())
                    .orElseGet(() -> {
                        var s = new Source();
                        s.setCode(client.getSourceCode());
                        s.setName(client.getSourceCode().toUpperCase());
                        return sourceRepo.save(s);
                    });

            // 2) Çek → normalize → idempotent kaydet → index
            for (var raw : client.fetchLatest()) {
                var exists = annRepo.findBySourceIdAndExternalId(src.getId(), raw.externalId()).isPresent();
                if (exists) continue; // idempotent

                Announcement a = new Announcement();
                a.setSource(src);
                a.setExternalId(raw.externalId());
                a.setTitle(cleaner.toText(raw.title()));
                a.setContent(cleaner.toText(raw.htmlContent()));
                a.setUrl(raw.url());
                a.setCategory(raw.category());
                a.setPublishedAt(raw.publishedAt());
                // scrapedAt/lang @PrePersist veya mapper’da set ediliyor

                annRepo.save(a);

                // 3) Vektör indeksle
                embeddingService.indexAnnouncement(a);

                inserted++;
            }

            job.setStatus("SUCCESS");
            job.setItemCount(inserted);
            return Map.of("ok", true, "inserted", inserted);

        } catch (Exception e) {
            log.error("etl failed", e);
            job.setStatus("FAILED");
            job.setMessage(e.getMessage());
            return Map.of("ok", false, "inserted", inserted, "error", e.getMessage());

        } finally {
            job.setFinishedAt(Instant.now());
            jobRepo.save(job);
        }
    }
}