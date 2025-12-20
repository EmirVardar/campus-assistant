package com.campus.backend.etl;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class CsSakaryaClient implements AnnouncementClient {

    /**
     * ÖNEMLİ:
     * Pagination query param ile değil, path ile:
     * https://cs.sakarya.edu.tr/tr/duyuru/goruntule/liste/0/1
     * https://cs.sakarya.edu.tr/tr/duyuru/goruntule/liste/0/2 ...
     */
    private static final String BASE_URL = "https://cs.sakarya.edu.tr/tr/duyuru/goruntule/liste";

    private static final ZoneId ZONE_ID_ISTANBUL = ZoneId.of("Europe/Istanbul");

    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

    // Türkçe ay isimleri: "20 Ekim 2025"
    private static final Locale LOCALE_TR = new Locale("tr", "TR");
    private static final DateTimeFormatter DF_FULL = DateTimeFormatter.ofPattern("d MMMM yyyy", LOCALE_TR);

    // Bazı sayfalarda ay kısaltmalı gelebilir diye ikinci deneme:
    private static final DateTimeFormatter DF_SHORT = DateTimeFormatter.ofPattern("d MMM yyyy", LOCALE_TR);

    // Metinden tarih ayıklamak için: "20 Ekim 2025"
    private static final Pattern DATE_PATTERN =
            Pattern.compile("(\\d{1,2}\\s+\\p{L}+\\s+\\d{4})", Pattern.UNICODE_CASE);

    @Value("${app.etl.cs-sakarya.test-mode:false}")
    private boolean testMode;

    @Value("${app.etl.cs-sakarya.max-pages:200}")
    private int maxPages;

    @Value("${app.etl.cs-sakarya.sleep-ms:300}")
    private long sleepMs;

    @Override
    public String getSourceCode() {
        return "cs_sakarya";
    }

    @Override
    public List<RawAnnouncement> fetchLatest() throws Exception {
        List<RawAnnouncement> announcements = new ArrayList<>();
        Set<String> seenExternalIds = new HashSet<>();

        int page = 1;

        System.out.println("====== CsSakaryaClient: fetchLatest BAŞLADI ======");
        System.out.println("CsSakaryaClient: testMode=" + testMode + ", maxPages=" + maxPages + ", sleepMs=" + sleepMs);

        while (true) {
            if (page > maxPages) {
                System.out.println("CsSakaryaClient: maxPages limitine ulaşıldı (" + maxPages + "), döngü durduruluyor.");
                break;
            }

            // ✅ DOĞRU URL: /liste/0/{page}
            String url = BASE_URL + "/0/" + page;
            System.out.println("CsSakaryaClient: Sayfa çekiliyor: " + url);

            Document doc = Jsoup.connect(url)
                    .userAgent(UA)
                    .timeout(15_000)
                    .get();

            /**
             * ✅ Dayanıklı liste yakalama:
             * Bu sitede her item’da "Görüntüle" linki var ve href’i detay sayfasına gidiyor.
             * Metin/class değişse bile genelde bu link durur.
             */
            Elements viewLinks = doc.select("a:matchesOwn(^\\s*Görüntüle\\s*$)");

            System.out.println("CsSakaryaClient: Sayfa " + page + " - Görüntüle link sayısı: " + viewLinks.size());

            if (viewLinks.isEmpty()) {
                System.out.println("CsSakaryaClient: Görüntüle linki bulunamadı (muhtemelen sayfa bitti), döngü durduruluyor.");
                break;
            }

            for (Element viewLink : viewLinks) {
                String detailUrl = viewLink.absUrl("href");
                if (detailUrl == null || detailUrl.isBlank()) {
                    continue;
                }

                // Aynı duyuru için sayfada 2 link olabiliyor; externalId ile tekilleştir
                String externalId = extractExternalId(detailUrl);
                if (externalId == null) {
                    System.err.println("externalId çıkarılamadı, atlanıyor: " + detailUrl);
                    continue;
                }
                if (!seenExternalIds.add(externalId)) {
                    continue;
                }

                try {
                    // Item kapsayıcı metninden başlık + tarih yakalamaya çalış
                    Element container = findReasonableContainer(viewLink);
                    String containerText = (container != null) ? container.text() : "";

                    // Başlık genelde aynı container içinde; en güvenlisi: aynı href’e giden "başlık linki"ni bul
                    String title = extractTitleNearLink(container, detailUrl);
                    if (title == null || title.isBlank()) {
                        // fallback: container text çok uzunsa ilk 120 char vs.
                        title = fallbackTitle(containerText, externalId);
                    }

                    Instant date = parseDateFromContainerText(containerText);

                    Document detailDoc = Jsoup.connect(detailUrl)
                            .userAgent(UA)
                            .timeout(15_000)
                            .get();

                    Element contentElement = detailDoc.selectFirst("div.blog-post-inner");
                    String htmlContent = (contentElement != null)
                            ? contentElement.html()
                            : "<p>İçerik bulunamadı.</p>";

                    RawAnnouncement raw = new RawAnnouncement(
                            externalId,
                            title,
                            htmlContent,
                            detailUrl,
                            "duyuru",
                            date
                    );

                    announcements.add(raw);

                    System.out.println("CsSakaryaClient: İşleniyor -> " + title);

                } catch (Exception e) {
                    System.err.println("Duyuru parse edilirken hata: " + e.getMessage() + " (URL: " + detailUrl + ")");
                }
            }

            if (testMode) {
                System.out.println("CsSakaryaClient: TEST MODE: Sadece ilk sayfa işlendi, durduruluyor.");
                break;
            }

            page++;

            if (sleepMs > 0) {
                try {
                    Thread.sleep(sleepMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        System.out.println("====== CsSakaryaClient: fetchLatest BİTTİ. Toplam çekilen: " + announcements.size() + " ======");
        return announcements;
    }

    private Element findReasonableContainer(Element link) {
        // Linkin üst parent’ına doğru çıkıp “bir duyuru bloğu”na benzer yeri yakalamaya çalışır.
        // Çok spesifik class’a bağlamıyoruz.
        Element cur = link;
        for (int i = 0; i < 6 && cur != null; i++) {
            // Çok genel bir yaklaşım: belli bir büyüklükte metin taşıyan parent genelde item olur.
            Element parent = cur.parent();
            if (parent == null) break;

            String txt = parent.text();
            if (txt != null && txt.length() > 30) {
                // Bir önceki parent daha da iyi olabilir; ama çok yukarı çıkıp tüm sayfayı almamak için limit var.
                cur = parent;
            } else {
                cur = parent;
            }
        }
        return cur;
    }

    private String extractTitleNearLink(Element container, String detailUrl) {
        if (container == null) return null;

        // Aynı detayUrl’e giden, ama "Görüntüle" olmayan link çoğunlukla başlıktır.
        Elements sameHrefLinks = container.select("a[href]");
        for (Element a : sameHrefLinks) {
            String href = a.absUrl("href");
            if (detailUrl.equals(href)) {
                String t = a.text().trim();
                if (!t.equalsIgnoreCase("Görüntüle") && !t.isBlank()) {
                    return t;
                }
            }
        }
        return null;
    }

    private String fallbackTitle(String containerText, String externalId) {
        if (containerText == null || containerText.isBlank()) {
            return "Duyuru " + externalId;
        }
        String t = containerText.trim();
        if (t.length() > 120) t = t.substring(0, 120) + "...";
        return t;
    }

    private String extractExternalId(String detailUrl) {
        // Örn: https://cs.sakarya.edu.tr/tr/duyuru/goruntule/12345/...
        try {
            String[] urlParts = detailUrl.split("/");
            if (urlParts.length < 2) return null;
            return urlParts[urlParts.length - 2];
        } catch (Exception e) {
            return null;
        }
    }

    private Instant parseDateFromContainerText(String text) {
        // Container text içinde "20 Ekim 2025" kalıbını ara
        if (text == null) return Instant.now();

        Matcher m = DATE_PATTERN.matcher(text);
        if (!m.find()) {
            return Instant.now();
        }

        String dateString = m.group(1);
        return parseDate(dateString);
    }

    private Instant parseDate(String dateString) {
        // "20 Ekim 2025" -> Instant
        try {
            LocalDate localDate = LocalDate.parse(dateString, DF_FULL);
            return localDate.atStartOfDay(ZONE_ID_ISTANBUL).toInstant();
        } catch (Exception ignore) {
        }

        // Fallback: "20 Eki 2025" gibi olursa
        try {
            LocalDate localDate = LocalDate.parse(dateString, DF_SHORT);
            return localDate.atStartOfDay(ZONE_ID_ISTANBUL).toInstant();
        } catch (Exception e) {
            return Instant.now();
        }
    }
}
