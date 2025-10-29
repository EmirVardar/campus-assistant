package com.campus.backend.etl;

import java.time.Instant;
import java.util.List;

public interface AnnouncementClient {
    String getSourceCode();                 // ör: "muys"
    List<RawAnnouncement> fetchLatest() throws Exception;
}
