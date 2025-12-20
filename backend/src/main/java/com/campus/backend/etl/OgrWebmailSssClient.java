package com.campus.backend.etl;

import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class OgrWebmailSssClient implements AnnouncementClient {

    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

    // fallback keşif/parse için
    private static final Pattern DIGITS = Pattern.compile("(\\d+)");
    private static final Pattern SSSORULAR_CALL = Pattern.compile("SSSorular\\((\\d+)\\)");
    private static final Pattern SSSMODAL_CALL = Pattern.compile("SssModal\\((\\d+)\\)");

    @Value("${app.etl.ogrwebmail-sss.base-url:https://ogrwebmail.sakarya.edu.tr}")
    private String baseUrl;

    /**
     * Kategori menüsünün bulunduğu sayfa (solda kategori listesi olan ekran).
     * Bunu mümkünse gerçek sayfa URL’sine ayarla.
     * Boş kalırsa baseUrl + "/" ile dener.
     */
    @Value("${app.etl.ogrwebmail-sss.menu-url:}")
    private String menuUrl;

    /** "2,13,14,..."  boş bırak -> otomatik keşif */
    @Value("${app.etl.ogrwebmail-sss.category-ids:}")
    private String categoryIdsCsv;

    @Value("${app.etl.ogrwebmail-sss.test-mode:false}")
    private boolean testMode;

    @Value("${app.etl.ogrwebmail-sss.max-items:2000}")
    private int maxItems;

    @Value("${app.etl.ogrwebmail-sss.sleep-ms:200}")
    private long sleepMs;

    @Override
    public String getSourceCode() {
        return "ogrwebmail_sss";
    }

    @Override
    public List<RawAnnouncement> fetchLatest() throws Exception {
        System.out.println("====== OgrWebmailSssClient: fetchLatest BAŞLADI ======");
        System.out.println("baseUrl=" + baseUrl);
        System.out.println("menuUrl=" + menuUrl);
        System.out.println("testMode=" + testMode + ", maxItems=" + maxItems + ", sleepMs=" + sleepMs);

        String landingUrl = (menuUrl != null && !menuUrl.isBlank()) ? menuUrl : (baseUrl + "/");

        // ✅ Cookie jar (tarayıcı gibi davranmak için)
        Map<String, String> cookies = new HashMap<>();
        try {
            Connection.Response landing = Jsoup.connect(landingUrl)
                    .userAgent(UA)
                    .timeout(15_000)
                    .method(Connection.Method.GET)
                    .execute();
            cookies.putAll(landing.cookies());
        } catch (Exception e) {
            System.err.println("Landing cookie alma başarısız: " + e.getMessage());
        }

        List<Integer> categoryIds = parseCategoryIds(categoryIdsCsv);
        if (categoryIds.isEmpty()) {
            categoryIds = discoverCategoryIds(landingUrl, cookies);
        }
        if (categoryIds.isEmpty()) {
            System.err.println("Kategori bulunamadı. En azından 2 deneniyor.");
            categoryIds = List.of(2);
        }

        System.out.println("Kullanılacak categoryIds=" + categoryIds);

        List<RawAnnouncement> out = new ArrayList<>();
        Set<String> seenExternalIds = new HashSet<>();
        AtomicInteger counter = new AtomicInteger(0);

        for (Integer catId : categoryIds) {
            if (catId == null) continue;

            if (counter.get() >= maxItems) break;

            String listUrl = baseUrl + "/Home/SSSorular/" + catId;
            System.out.println("Kategori listesi (POST) çekiliyor: " + listUrl);

            // ✅ DevTools: POST
            Connection.Response listResp = Jsoup.connect(listUrl)
                    .userAgent(UA)
                    .timeout(15_000)
                    .method(Connection.Method.POST)
                    .cookies(cookies)
                    .ignoreHttpErrors(true)
                    .followRedirects(true)
                    .header("Accept", "text/html,*/*")
                    .header("X-Requested-With", "XMLHttpRequest")
                    .referrer(landingUrl)
                    .execute();

            cookies.putAll(listResp.cookies());
            Document listDoc = listResp.parse();

            // Liste içindeki soru butonlarını yakala (tek selector’a bağlı kalma)
            Elements candidates = new Elements();
            candidates.addAll(listDoc.select("button[data-sss-id]"));
            candidates.addAll(listDoc.select("[data-sss-id]"));
            candidates.addAll(listDoc.select("button[onclick*=SssModal], a[onclick*=SssModal]"));
            candidates.addAll(listDoc.select("a[href*=/Home/SssModal/]"));

            // duplicate elementleri temizle
            LinkedHashSet<Element> unique = new LinkedHashSet<>(candidates);
            System.out.println("catId=" + catId + " soru adayı=" + unique.size());

            for (Element el : unique) {
                if (counter.get() >= maxItems) {
                    System.out.println("maxItems limitine ulaşıldı (" + maxItems + "), durduruluyor.");
                    return out;
                }

                String sssId = extractSssId(el);
                if (sssId == null || sssId.isBlank()) continue;

                String title = extractTitle(el);
                String externalId = "sss-" + sssId;

                if (!seenExternalIds.add(externalId)) continue;

                String modalUrl = baseUrl + "/Home/SssModal/" + sssId;

                try {
                    // ✅ DevTools: GET
                    Connection.Response modalResp = Jsoup.connect(modalUrl)
                            .userAgent(UA)
                            .timeout(15_000)
                            .method(Connection.Method.GET)
                            .cookies(cookies)
                            .ignoreHttpErrors(true)
                            .followRedirects(true)
                            .header("Accept", "text/html,*/*")
                            .referrer(landingUrl)
                            .execute();

                    cookies.putAll(modalResp.cookies());
                    Document modalDoc = modalResp.parse();

                    String htmlContent = extractModalHtml(modalDoc);

                    out.add(new RawAnnouncement(
                            externalId,
                            title,
                            htmlContent,
                            modalUrl,
                            "sss",
                            Instant.now()
                    ));

                    int c = counter.incrementAndGet();
                    if (testMode && c >= 20) {
                        System.out.println("TEST MODE: 20 kayıt sonrası durduruldu.");
                        return out;
                    }

                    sleepIfNeeded();

                } catch (Exception e) {
                    System.err.println("Modal çekme hatası sssId=" + sssId + " url=" + modalUrl + " err=" + e.getMessage());
                }
            }
        }

        System.out.println("====== OgrWebmailSssClient: fetchLatest BİTTİ. Toplam: " + out.size() + " ======");
        return out;
    }

    private List<Integer> parseCategoryIds(String csv) {
        if (csv == null || csv.isBlank()) return Collections.emptyList();
        LinkedHashSet<Integer> ids = new LinkedHashSet<>();
        for (String p : csv.split(",")) {
            try { ids.add(Integer.parseInt(p.trim())); } catch (Exception ignore) {}
        }
        return new ArrayList<>(ids);
    }

    private List<Integer> discoverCategoryIds(String landingUrl, Map<String, String> cookies) {
        System.out.println("Kategori keşfi: " + landingUrl);

        try {
            Connection.Response resp = Jsoup.connect(landingUrl)
                    .userAgent(UA)
                    .timeout(15_000)
                    .method(Connection.Method.GET)
                    .cookies(cookies)
                    .execute();

            cookies.putAll(resp.cookies());
            Document doc = resp.parse();

            LinkedHashSet<Integer> ids = new LinkedHashSet<>();

            // 1) data-id
            for (Element e : doc.select("button.nav-link[data-id], [data-id]")) {
                String s = e.attr("data-id").trim();
                try { if (!s.isBlank()) ids.add(Integer.parseInt(s)); } catch (Exception ignore) {}
            }

            // 2) onclick="SSSorular(13)"
            for (Element e : doc.select("[onclick*=SSSorular]")) {
                String onclick = e.attr("onclick");
                Matcher m = SSSORULAR_CALL.matcher(onclick);
                if (m.find()) ids.add(Integer.parseInt(m.group(1)));
            }

            // 3) href="/Home/SSSorular/13"
            for (Element e : doc.select("a[href*=/Home/SSSorular/]")) {
                String href = e.attr("href");
                Matcher m = DIGITS.matcher(href);
                if (m.find()) ids.add(Integer.parseInt(m.group(1)));
            }

            List<Integer> result = new ArrayList<>(ids);
            System.out.println("Keşfedilen categoryIds=" + result);
            return result;

        } catch (Exception e) {
            System.err.println("Kategori keşfi başarısız: " + e.getMessage());
            return Collections.emptyList();
        }
    }

    private String extractSssId(Element el) {
        // 1) data-sss-id
        String id = el.attr("data-sss-id");
        if (id != null && !id.isBlank()) return id.trim();

        // 2) onclick="SssModal(2)"
        String onclick = el.attr("onclick");
        if (onclick != null && !onclick.isBlank()) {
            Matcher m = SSSMODAL_CALL.matcher(onclick);
            if (m.find()) return m.group(1);
        }

        // 3) href="/Home/SssModal/2"
        String href = el.attr("href");
        if (href != null && href.contains("/Home/SssModal/")) {
            Matcher m = DIGITS.matcher(href);
            if (m.find()) return m.group(1);
        }

        return null;
    }

    private String extractTitle(Element el) {
        Element strong = el.selectFirst("strong");
        String t = (strong != null) ? strong.text() : el.text();
        t = (t != null) ? t.trim() : "";
        return t.isBlank() ? "SSS" : t;
    }

    private String extractModalHtml(Document modalDoc) {
        Element body = modalDoc.body();
        if (body != null) {
            String html = body.html().trim();
            if (!html.isBlank()) return html;
        }
        String fallback = modalDoc.html();
        return (fallback == null || fallback.isBlank()) ? "<p>İçerik bulunamadı.</p>" : fallback;
    }

    private void sleepIfNeeded() {
        if (sleepMs <= 0) return;
        try { Thread.sleep(sleepMs); }
        catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
    }
}
