package com.campus.backend.etl;

import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.List;

@Component
public class FakeClient implements AnnouncementClient {
    @Override public String getSourceCode(){ return "muys"; }

    @Override public List<RawAnnouncement> fetchLatest() {
        return List.of(
                new RawAnnouncement("ext-1",
                        "Kayit Duyurusu",
                        "<p>2025 yili guz donemi kayit tarihleri 1-5 Eylul arasindadir.</p>", // <-- İçeriği biraz detaylandırdım
                        "https://x/1","kayit",Instant.now()),

                new RawAnnouncement("ext-2",
                        "Burs Basvurusu",
                        "<p>KYK burs basvurulari baslamistir.</p>", // <-- İçeriği biraz detaylandırdım
                        "https://x/2","burs",Instant.now()),

                // ----- YENİ EKLENEN DUYURU -----
                new RawAnnouncement("ext-3",
                        "Harç Odeme Bilgilendirmesi",
                        "<p>Katki payi ve ogrenim ucreti (harc) odemeleri 10-15 Eylul tarihleri arasinda yapilacaktir.</p>",
                        "https://x/3","harc",Instant.now())
                // ----- YENİ DUYURU BİTTİ -----
        );
    }
}