package com.campus.backend.etl;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Component
public class CsSakaryaClient implements AnnouncementClient {

    private static final String BASE_URL = "https://cs.sakarya.edu.tr/tr/duyuru/goruntule/liste";
    // Türkçe ay isimlerini (Kasım, Aralık vb.) parse etmek için
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter
            .ofPattern("dd MMMM yyyy", new Locale("tr", "TR"));
    private static final ZoneId ZONE_ID_ISTANBUL = ZoneId.of("Europe/Istanbul");


    @Override
    public String getSourceCode() {
        return "cs_sakarya"; // Bu kaynağın yeni kodu
    }

    @Override
    public List<RawAnnouncement> fetchLatest() throws Exception {
        List<RawAnnouncement> announcements = new ArrayList<>();
        int page = 1;

        // Logları koruyoruz
        System.out.println("====== CsSakaryaClient: fetchLatest BAŞLADI ======");

        while (true) {
            String url = BASE_URL + "?page=" + page;
            System.out.println("CsSakaryaClient: Sayfa çekiliyor: " + url);

            // 1. Tarayıcı (User-Agent) bilgisiyle bağlan
            Document doc = Jsoup.connect(url)
                    .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
                    .get();

            // 2. Ana liste seçicisi (Bu zaten doğruydu)
            Elements items = doc.select("div.list-event-item");

            System.out.println("CsSakaryaClient: Sayfa " + page + " - Bulunan öğe sayısı: " + items.size());

            if (items.isEmpty()) {
                System.out.println("CsSakaryaClient: Boş sayfa bulundu, döngü durduruluyor.");
                break;
            }

            // 3. Döngü
            for (Element item : items) {
                try {
                    // Ana verileri 'item' (div) içinden çek
                    Element titleLink = item.selectFirst("h5.event-title a");
                    String title = (titleLink != null) ? titleLink.text() : "Başlık bulunamadı";
                    String detailUrl = (titleLink != null) ? titleLink.absUrl("href") : null;

                    Element dateElement = item.selectFirst(".list-event-header .event-date");
                    String dateString = (dateElement != null) ? dateElement.text().trim() : "";

                    if (detailUrl == null) {
                        System.err.println("Duyuru linki bulunamadı, atlanıyor: " + title);
                        continue;
                    }

                    String[] urlParts = detailUrl.split("/");
                    String externalId = urlParts[urlParts.length - 2];

                    // İçeriği almak için duyuru detay sayfasına git
                    Document detailDoc = Jsoup.connect(detailUrl)
                            .userAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
                            .get();

                    // ===============================================
                    //         *** HATA BURADAYDI - DÜZELTİLDİ ***
                    // ===============================================
                    // ESKİSİ: detailDoc.selectFirst("div[property='text']");
                    // YENİSİ:
                    Element contentElement = detailDoc.selectFirst("div.blog-post-inner");
                    // ===============================================

                    String htmlContent = (contentElement != null) ? contentElement.html() : "<p>İçerik bulunamadı.</p>";

                    System.out.println("CsSakaryaClient: İşleniyor -> " + title); // Log

                    // KANIT LOG'u (Bu hala yerinde duruyor)
                    String contentPreview = Jsoup.parse(htmlContent).text();
                    if (contentPreview.length() > 50) {
                        contentPreview = contentPreview.substring(0, 50) + "..."; // Çok uzunsa kısalt
                    }
                    System.out.println("CsSakaryaClient:     -> Detay içeriği çekildi: '" + contentPreview + "'");


                    // Verileri RawAnnouncement'a dönüştür
                    RawAnnouncement raw = new RawAnnouncement(
                            externalId,
                            title,
                            htmlContent,
                            detailUrl,
                            "duyuru",
                            parseDate(dateString)
                    );
                    announcements.add(raw);

                } catch (Exception e) {
                    System.err.println("Duyuru parse edilirken hata: " + e.getMessage() + " (URL: " + item.selectFirst("h5.event-title a").absUrl("href") + ")");
                }
            }

            page++; // Bir sonraki sayfaya geç

            // TEST LİMİTİ (Bu da hala yerinde duruyor)
            if (page > 1) {
                System.out.println("CsSakaryaClient: TEST AŞAMASI: Sadece ilk sayfa işlendi, durduruluyor.");
                break; // 'while(true)' döngüsünü kır
            }

        }

        System.out.println("====== CsSakaryaClient: fetchLatest BİTTİ. Toplam çekilen: " + announcements.size() + " ======");
        return announcements;
    }

    // "04 Kasım 2024" -> Instant objesine
    private Instant parseDate(String dateString) {
        try {
            LocalDate localDate = LocalDate.parse(dateString, DATE_FORMATTER);
            return localDate.atStartOfDay(ZONE_ID_ISTANBUL).toInstant();
        } catch (Exception e) {
            return Instant.now();
        }
    }
}