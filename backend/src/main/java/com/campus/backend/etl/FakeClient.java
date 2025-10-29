package com.campus.backend.etl;

import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.List;

@Component
public class FakeClient implements AnnouncementClient {
    @Override public String getSourceCode(){ return "muys"; }

    @Override public List<RawAnnouncement> fetchLatest() {
        // Lütfen buradaki verilerin 'ı' ve 'ş' içermediğinden emin olun
        return List.of(
                new RawAnnouncement("ext-1","Kayit Duyurusu","<p>Kayit tarihleri...</p>","https://x/1","kayit",Instant.now()),
                new RawAnnouncement("ext-2","Burs Basvurusu","<p>Burs duyurusu...</p>","https://x/2","burs",Instant.now())
        );
    }
}