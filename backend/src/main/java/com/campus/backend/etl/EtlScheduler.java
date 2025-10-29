package com.campus.backend.etl; // veya .service

import com.campus.backend.service.EtlService; // EtlService'inizin yolu
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class EtlScheduler {
    private final List<AnnouncementClient> clients; // Otomatik olarak [FakeClient, CsSakaryaClient] listesini alır
    private final EtlService etl;

    // cron="saniye dakika saat gün ay gün(hafta)"
    @Scheduled(cron = "0 30 3 * * *", zone = "Europe/Istanbul") // her gün sabah 03:30
    public void daily() {
        log.info("Günlük ETL Job başlatılıyor...");
        // Listedeki TÜM istemcileri (hem 'muys' hem 'cs_sakarya') sırayla çalıştırır
        for (var c : clients) {
            log.info("ETL çalıştırılıyor: {}", c.getSourceCode());
            etl.pull(c);
        }
        log.info("Günlük ETL Job tamamlandı.");
    }
}
