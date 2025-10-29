package com.campus.backend.etl;

import org.jsoup.Jsoup;
import org.springframework.stereotype.Component;

@Component
public class HtmlCleaner {
    public String toText(String html) {
        String safe = (html == null ? "" : html);
        // HTML etiketlerini at, çoklu boşlukları tek boşluğa indir
        return Jsoup.parse(safe).text().replaceAll("\\s+", " ").trim();
    }
}
