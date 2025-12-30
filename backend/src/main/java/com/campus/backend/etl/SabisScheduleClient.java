package com.campus.backend.etl;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class SabisScheduleClient implements AnnouncementClient {

    private static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

    private static final String BASE_URL = "https://dersprogram.sabis.sakarya.edu.tr/Program/Birim/";

    // "3 .Yarıyıl Dersleri" / "3. Yarıyıl Dersleri"
    private static final Pattern SEMESTER_PATTERN =
            Pattern.compile("(\\d{1,2})\\s*\\.?\\s*Yarıyıl\\s+Dersleri", Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    // "A Grubu" / "B Grubu"
    private static final Pattern GROUP_PATTERN =
            Pattern.compile("^\\s*([A-ZÇĞİÖŞÜ])\\s*Grubu\\s*$", Pattern.UNICODE_CASE);

    // "Pazartesi 17:00 - 21:00"
    private static final Pattern DAY_TIME_PATTERN =
            Pattern.compile("^(Pazartesi|Salı|Çarşamba|Perşembe|Cuma|Cumartesi|Pazar)\\s+(\\d{2}:\\d{2})\\s*-\\s*(\\d{2}:\\d{2})\\s*$",
                    Pattern.UNICODE_CASE);

    @Value("${app.etl.sabis.birim-ids:975,976}")
    private String birimIdsCsv;

    @Value("${app.etl.sabis.timeout-ms:15000}")
    private int timeoutMs;

    @Value("${app.etl.sabis.sleep-ms:200}")
    private long sleepMs;

    @Value("${app.etl.sabis.test-mode:false}")
    private boolean testMode;

    @Override
    public String getSourceCode() {
        // Tek Source olsun; birim farkını externalId içine koyacağız.
        return "sabis_schedule";
    }

    @Override
    public List<RawAnnouncement> fetchLatest() throws Exception {
        List<Integer> birimIds = parseBirimIds(birimIdsCsv);
        List<RawAnnouncement> out = new ArrayList<>();
        Set<String> seenExternalIds = new HashSet<>();

        System.out.println("====== SabisScheduleClient: fetchLatest BAŞLADI ======");
        System.out.println("SabisScheduleClient: birimIds=" + birimIds + ", timeoutMs=" + timeoutMs + ", sleepMs=" + sleepMs + ", testMode=" + testMode);

        for (int bi = 0; bi < birimIds.size(); bi++) {
            int birimId = birimIds.get(bi);
            String url = BASE_URL + birimId;

            System.out.println("SabisScheduleClient: Sayfa çekiliyor: " + url);

            Document doc = Jsoup.connect(url)
                    .userAgent(UA)
                    .timeout(timeoutMs)
                    .get();

            List<ScheduleRow> rows = parseScheduleRows(doc, birimId, url);

            System.out.println("SabisScheduleClient: birimId=" + birimId + " -> satır sayısı: " + rows.size());

            for (ScheduleRow r : rows) {
                String externalId = buildExternalId(r);

                if (!seenExternalIds.add(externalId)) continue;

                // title: RAG’de hızlı tanıma için
                String title = "[DERS PROGRAMI] " + r.semesterNo + ". Yarıyıl - " + r.courseName
                        + (r.groupCode != null ? " (" + r.groupCode + " Grubu)" : "")
                        + " [" + r.birimId + "]";

                // htmlContent: Cleaner.toText sonrası okunabilir tek blok
                String htmlContent = buildHtmlContent(r);

                out.add(new RawAnnouncement(
                        externalId,
                        title,
                        htmlContent,
                        r.pageUrl,
                        "schedule",           // category çok kritik: duyurudan ayırır
                        Instant.now()         // publishedAt: schedule için "now" yeterli
                ));
            }

            if (testMode) {
                System.out.println("SabisScheduleClient: TEST MODE: sadece ilk birim işlendi, durduruluyor.");
                break;
            }

            if (sleepMs > 0 && bi < birimIds.size() - 1) {
                try { Thread.sleep(sleepMs); } catch (InterruptedException ie) { Thread.currentThread().interrupt(); }
            }
        }

        System.out.println("====== SabisScheduleClient: fetchLatest BİTTİ. Toplam: " + out.size() + " ======");
        return out;
    }

    // -------------------------
    // PARSING
    // -------------------------

    /**
     * SABIS sayfa DOM’u değişebildiği için:
     * 1) Önce "card" tabanlı parse deneriz (tipik bootstrap kartları).
     * 2) Sonuç çıkmazsa, daha gevşek selector + tablo satırı parse deneriz.
     */
    private List<ScheduleRow> parseScheduleRows(Document doc, int birimId, String pageUrl) {
        List<ScheduleRow> rows = new ArrayList<>();

        // 1) En yaygın yapı: ders kartları (div.card) + içinde grup satırları (tr/td)
        Elements cards = doc.select("div.card");
        if (!cards.isEmpty()) {
            for (Element card : cards) {
                // semester header genelde üst tarafta ayrı; kart içinde yoksa null kalabilir
                Integer semester = findSemesterNear(card);

                String courseName = extractCourseName(card);
                if (courseName == null || courseName.isBlank()) continue;

                // Grup satırları: tablo olabilir
                Elements trs = card.select("tr");
                if (trs.isEmpty()) {
                    // bazen tablo yok; satırlar div/row olabilir
                    trs = card.select("div.row");
                }

                // Eğer tablolu ise: A Grubu | hoca | derslik | gün-saat
                for (Element tr : trs) {
                    ParsedRow pr = tryParseRow(tr);
                    if (pr == null) continue;

                    rows.add(new ScheduleRow(
                            birimId,
                            semester != null ? semester : 0,
                            courseName,
                            pr.groupCode,
                            pr.instructor,
                            pr.location,
                            pr.day,
                            pr.start,
                            pr.end,
                            pageUrl
                    ));
                }
            }
        }

        // 2) Fallback: card parse boşsa, sayfadaki tüm "Grubu" satırlarını yakalamaya çalış
        if (rows.isEmpty()) {
            Elements maybeRows = doc.select("tr:has(td), div.row, div:matchesOwn(Grubu)");
            Integer currentSemester = null;
            String currentCourse = null;

            for (Element e : maybeRows) {
                // semester güncelle
                Integer sem = findSemesterNear(e);
                if (sem != null) currentSemester = sem;

                // course güncelle (yakın başlıktan)
                String cn = findCourseNameNear(e);
                if (cn != null) currentCourse = cn;

                ParsedRow pr = tryParseRow(e);
                if (pr == null) continue;

                rows.add(new ScheduleRow(
                        birimId,
                        currentSemester != null ? currentSemester : 0,
                        currentCourse != null ? currentCourse : "Ders",
                        pr.groupCode,
                        pr.instructor,
                        pr.location,
                        pr.day,
                        pr.start,
                        pr.end,
                        pageUrl
                ));
            }
        }

        // 3) semester=0 kalanlar varsa, sayfa başlığından yakalamaya çalış (nadiren gerekir)
        for (int i = 0; i < rows.size(); i++) {
            if (rows.get(i).semesterNo == 0) {
                Integer sem = findSemesterAnywhere(doc);
                if (sem != null) {
                    rows.set(i, rows.get(i).withSemester(sem));
                }
            }
        }

        return rows;
    }

    private Integer findSemesterAnywhere(Document doc) {
        Element h = doc.selectFirst("*:matchesOwn(\\d{1,2}\\s*\\.?\\s*Yarıyıl\\s+Dersleri)");
        if (h == null) return null;
        Matcher m = SEMESTER_PATTERN.matcher(h.text());
        if (m.find()) return Integer.parseInt(m.group(1));
        return null;
    }

    private Integer findSemesterNear(Element el) {
        // yukarı doğru 6 parent dolaş, sonra kendi içinde başlık ara
        Element cur = el;
        for (int i = 0; i < 6 && cur != null; i++) {
            Element header = cur.selectFirst("*:matchesOwn(\\d{1,2}\\s*\\.?\\s*Yarıyıl\\s+Dersleri)");
            if (header != null) {
                Matcher m = SEMESTER_PATTERN.matcher(header.text());
                if (m.find()) return Integer.parseInt(m.group(1));
            }
            cur = cur.parent();
        }
        return null;
    }

    private String extractCourseName(Element card) {
        // Kart başlığı genelde link ya da header'da olur
        Element t = card.selectFirst(".card-header a, .card-header, h4, h5, h6, a");
        if (t == null) return null;
        String s = t.text().trim();
        // "T+U Saat..." gibi suffix’leri temizlemeye çalış
        s = s.replaceAll("\\(\\s*T\\+U\\s*Saat\\s*:\\s*[^\\)]*\\)", "").trim();
        return s;
    }

    private String findCourseNameNear(Element el) {
        if (el == null) return null;

        // 1) Kendinde başlık vari element ara
        Element t = el.selectFirst("h4, h5, h6, .card-header a, .card-header");
        if (t != null) {
            String s = t.text().trim();
            s = s.replaceAll("\\(\\s*T\\+U\\s*Saat\\s*:\\s*[^\\)]*\\)", "").trim();
            if (!s.isBlank()) return s;
        }

        // 2) Yukarı doğru kart/başlık arayalım
        Element cur = el;
        for (int i = 0; i < 6 && cur != null; i++) {
            Element h = cur.selectFirst("h4, h5, h6, .card-header a, .card-header");
            if (h != null) {
                String s = h.text().trim();
                s = s.replaceAll("\\(\\s*T\\+U\\s*Saat\\s*:\\s*[^\\)]*\\)", "").trim();
                if (!s.isBlank()) return s;
            }
            cur = cur.parent();
        }

        return null;
    }


    /**
     * Bir elementten "A Grubu | Hoca | Derslik | Gün Saat" ayıklamaya çalışır.
     * Hem <tr><td> yapısına hem div row yapısına toleranslıdır.
     */
    private ParsedRow tryParseRow(Element rowEl) {
        List<String> cells = new ArrayList<>();

        Elements tds = rowEl.select("td");
        if (!tds.isEmpty()) {
            for (Element td : tds) {
                String s = td.text().replace("\u00A0", " ").trim();
                if (!s.isBlank()) cells.add(s);
            }
        } else {
            // div row ise: içindeki textleri kolon gibi topla
            Elements cols = rowEl.select("div, span, a");
            for (Element c : cols) {
                String s = c.text().replace("\u00A0", " ").trim();
                if (!s.isBlank()) cells.add(s);
            }
            // Çok gürültü olabilir; benzersizleştir
            cells = dedupePreserveOrder(cells);
        }

        if (cells.isEmpty()) return null;

        // 1) group
        String groupCode = null;
        int groupIdx = -1;
        for (int i = 0; i < cells.size(); i++) {
            Matcher gm = GROUP_PATTERN.matcher(cells.get(i));
            if (gm.matches()) {
                groupCode = gm.group(1);
                groupIdx = i;
                break;
            }
        }
        if (groupCode == null) return null; // schedule satırı değil

        // 2) day/time cell (en sondan ara)
        String day = null, start = null, end = null;
        int dtIdx = -1;
        for (int i = cells.size() - 1; i >= 0; i--) {
            RawDayTime dt = parseDayTime(cells.get(i));
            if (dt != null) {
                day = dt.day;
                start = dt.start;
                end = dt.end;
                dtIdx = i;
                break;
            }
        }
        if (day == null) return null;

        // 3) location (derslik/lab/internet vs)
        String location = null;
        int locIdx = -1;
        for (int i = groupIdx + 1; i < dtIdx; i++) {
            String s = cells.get(i);
            if (looksLikeLocation(s)) {
                location = s;
                locIdx = i;
                break;
            }
        }
        // bazen "İNTERNET" yeri ayrı link olarak geliyor, yine location kabul

        // 4) instructor: group ile location arasındaki veya location yoksa group ile dt arasındaki blok
        String instructor = null;
        int instrStart = groupIdx + 1;
        int instrEnd = (locIdx >= 0) ? locIdx : dtIdx;
        if (instrEnd > instrStart) {
            instructor = String.join(" ", cells.subList(instrStart, instrEnd)).trim();
            if (instructor.isBlank()) instructor = null;
        }

        // normalize
        if (location != null && location.isBlank()) location = null;

        return new ParsedRow(groupCode, instructor, location, day, start, end);
    }

    private RawDayTime parseDayTime(String s) {
        if (s == null) return null;
        String x = s.trim().replaceAll("\\s{2,}", " ");
        Matcher m = DAY_TIME_PATTERN.matcher(x);
        if (!m.matches()) return null;
        return new RawDayTime(m.group(1), m.group(2), m.group(3));
    }

    private boolean looksLikeLocation(String s) {
        if (s == null) return false;
        String x = s.toLowerCase(Locale.ROOT);
        return x.contains("derslik")
                || x.contains("laboratuvar")
                || x.contains("lab")
                || x.contains("amfi")
                || x.contains("internet")
                || x.matches(".*\\b\\d{3,4}\\b.*"); // 1102, 1103 gibi
    }

    private List<String> dedupePreserveOrder(List<String> in) {
        List<String> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (String s : in) {
            if (seen.add(s)) out.add(s);
        }
        return out;
    }

    private String buildExternalId(ScheduleRow r) {
        // idempotency anahtarı: birim + semester + ders + grup + gün + saat + yer
        String courseKey = safeKey(r.courseName);
        String locKey = safeKey(r.location);
        return r.birimId + "|" + r.semesterNo + "|" + courseKey + "|" + nullToDash(r.groupCode) + "|"
                + r.dayOfWeek + "|" + r.startTime + "-" + r.endTime + "|" + locKey;
    }

    private String safeKey(String s) {
        if (s == null) return "-";
        String x = s.replace("\u00A0", " ").trim();
        x = x.replaceAll("\\s{2,}", " ");
        return x.isBlank() ? "-" : x;
    }

    private String nullToDash(String s) {
        return (s == null || s.isBlank()) ? "-" : s.trim();
    }

    private String buildHtmlContent(ScheduleRow r) {
        // HtmlCleaner sonrasında düzgün düz metin olacak.
        // <pre> kullanmak şart değil ama formatı koruyor.
        return "<pre>" +
                "Kaynak: SABIS Ders Programı\n" +
                "Birim: " + r.birimId + "\n" +
                "Yarıyıl: " + r.semesterNo + "\n" +
                "Ders: " + r.courseName + "\n" +
                "Grup: " + (r.groupCode != null ? r.groupCode : "-") + "\n" +
                "Hoca: " + (r.instructor != null ? r.instructor : "-") + "\n" +
                "Yer: " + (r.location != null ? r.location : "-") + "\n" +
                "Zaman: " + r.dayOfWeek + " " + r.startTime + " - " + r.endTime + "\n" +
                "</pre>";
    }

    private List<Integer> parseBirimIds(String csv) {
        if (csv == null || csv.isBlank()) return List.of(975, 976);
        String[] parts = csv.split(",");
        List<Integer> ids = new ArrayList<>();
        for (String p : parts) {
            String t = p.trim();
            if (t.isBlank()) continue;
            try { ids.add(Integer.parseInt(t)); } catch (Exception ignored) {}
        }
        if (ids.isEmpty()) ids = List.of(975, 976);
        return ids;
    }

    // -------------------------
    // SMALL RECORDS
    // -------------------------

    private record ParsedRow(
            String groupCode,
            String instructor,
            String location,
            String day,
            String start,
            String end
    ) {}

    private record RawDayTime(String day, String start, String end) {}

    private record ScheduleRow(
            int birimId,
            int semesterNo,
            String courseName,
            String groupCode,
            String instructor,
            String location,
            String dayOfWeek,
            String startTime,
            String endTime,
            String pageUrl
    ) {
        ScheduleRow withSemester(int sem) {
            return new ScheduleRow(birimId, sem, courseName, groupCode, instructor, location, dayOfWeek, startTime, endTime, pageUrl);
        }
    }
}
