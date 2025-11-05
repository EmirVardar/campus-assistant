package com.campus.backend.vector;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

@Component
public class ChromaClient {

    @Value("${CHROMA_URL}")
    String base;

    private volatile String collectionId;    // aktif koleksiyon ID
    private volatile String collectionName;  // bilgilendirme

    private WebClient wc() { return WebClient.create(base); }

    // ------------------- PUBLIC API -------------------

    /** Varsayılan: 1536 boyutlu koleksiyon. HATA FIRLATMAZ; loglar. */
    public void ensure(String name) {
        ensureWithDim(name, 1536);
    }

    /** İstersen dim ver (ör. 3072). HATA FIRLATMAZ; loglar. */
    public void ensureWithDim(String name, int dimensionality) {
        this.collectionName = name;

        try {
            // 1) get_or_create ile oluştur / doğrula ve mümkünse ID’yi cevaptan çek
            Map<String, Object> metadata = Map.of(
                    "hnsw:space", "cosine",
                    "dimensionality", dimensionality
            );
            Map<String, Object> body = Map.of(
                    "name", name,
                    "get_or_create", true,
                    "metadata", metadata
            );

            System.out.println("Chroma ensure: name=" + name + " dim=" + dimensionality);

            Map<?,?> resp = wc().post().uri("/api/v1/collections")
                    .bodyValue(body)
                    .retrieve()
                    .onStatus(s -> s.is4xxClientError() || s.is5xxServerError(),
                            r -> r.bodyToMono(String.class).map(msg ->
                                    new RuntimeException("Chroma ensure HTTP " + r.statusCode() + ": " + msg)))
                    .bodyToMono(Map.class)
                    .block();

            // 2) Dönen cevaptan ID’yi çıkar (v1 bazen {"collection":{...}}, bazen flat dönebilir)
            String id = extractIdFromEnsureResponse(resp);
            if (id != null && !id.isBlank()) {
                this.collectionId = id;
                System.out.println("Chroma ensure OK (id from POST): " + this.collectionId);
                return;
            }

            // 3) POST’ta ID’yi yakalayamazsak, ad ile ara (ID’yi bul)
            this.collectionId = fetchCollectionIdByName(name);
            if (this.collectionId != null) {
                System.out.println("Chroma ensure OK (id from GET): " + this.collectionId);
            } else {
                System.err.println("Chroma ensure WARNING: Koleksiyon ID bulunamadı (name=" + name + "). " +
                        "Upsert sırasında tekrar denenecek.");
            }
        } catch (Exception ex) {
            // Uygulamanın düşmesini engelle: sadece logla
            System.err.println("Chroma ensure ERROR: " + ex.getMessage());
        }
    }

    /**
     * Upsert: dışarıdan verilen 'collection' ismini YOK SAYAR; içte ID kullanır.
     * ID bilinmiyorsa lazy olarak adıyla bulur, yine yoksa get_or_create dener.
     */
    public void upsert(String /*ignored*/ collection, String id,
                       List<Float> embedding, Map<String, Object> meta, String doc) {

        ensureCollectionIdLazily(); // ID yoksa burada elde etmeye çalış

        Map<String, Object> body = Map.of(
                "ids", List.of(id),
                "embeddings", List.of(embedding),
                "metadatas", List.of(meta),
                "documents", List.of(doc)
        );

        wc().post().uri("/api/v1/collections/{id}/upsert", this.collectionId)
                .bodyValue(body)
                .retrieve()
                .onStatus(s -> s.is4xxClientError() || s.is5xxServerError(),
                        resp -> resp.bodyToMono(String.class).map(msg ->
                                new RuntimeException("Chroma upsert HTTP " + resp.statusCode() + ": " + msg)))
                .bodyToMono(Map.class)
                .doOnNext(res -> System.out.println("Chroma upsert OK: " + res))
                .block();
    }
    /**
     * Vektörel arama yapar.
     * @param queryEmbedding Arama yapılacak embedding
     * @param nResults İstenen sonuç sayısı (top-k)
     * @return Chroma'dan dönen ham Map cevabı
     */
    public Map<?, ?> query(List<Float> queryEmbedding, int nResults) {
        ensureCollectionIdLazily(); // ID'nin varlığından emin ol

        Map<String, Object> body = Map.of(
                // Chroma, sorgu listesi bekler, biz tek sorgu atıyoruz
                "query_embeddings", List.of(queryEmbedding),
                "n_results", nResults,
                // Bize metin, metadata ve benzerlik skoru lazım
                "include", List.of("metadatas", "documents", "distances")
        );

        return wc().post()
                .uri("/api/v1/collections/{id}/query", this.collectionId)
                .bodyValue(body)
                .retrieve()
                .onStatus(s -> s.is4xxClientError() || s.is5xxServerError(),
                        resp -> resp.bodyToMono(String.class).map(msg ->
                                new RuntimeException("Chroma query HTTP " + resp.statusCode() + ": " + msg)))
                .bodyToMono(Map.class)
                .block();
    }
    // ------------------- INTERNAL HELPERS -------------------

    /** ensure POST cevabından ID’yi esnek şekilde çıkar. */
    @SuppressWarnings("unchecked")
    private String extractIdFromEnsureResponse(Map<?,?> resp) {
        if (resp == null) return null;

        // olası 1: {"id":"...", "name":"..."}
        Object idFlat = resp.get("id");
        if (idFlat instanceof String s && !s.isBlank()) return s;

        // olası 2: {"collection": {"id":"...", "name":"..."}}
        Object c = resp.get("collection");
        if (c instanceof Map<?,?> m) {
            Object id = m.get("id");
            if (id instanceof String s2 && !s2.isBlank()) return s2;
        }

        // olası 3: {"collections":[{"id":"...","name":"..."}]}
        Object list = resp.get("collections");
        if (list instanceof List<?> l && !l.isEmpty()) {
            Object first = l.get(0);
            if (first instanceof Map<?,?> m2) {
                Object id = m2.get("id");
                if (id instanceof String s3 && !s3.isBlank()) return s3;
            }
        }

        return null;
    }

    /** Adla koleksiyon ID’sini getir. Bulamazsa null. */
    @SuppressWarnings("unchecked")
    private String fetchCollectionIdByName(String name) {
        Map<?, ?> result = wc().get()
                .uri(uriBuilder -> uriBuilder.path("/api/v1/collections")
                        .queryParam("name", name).build())
                .retrieve()
                .onStatus(s -> s.is4xxClientError() || s.is5xxServerError(),
                        resp -> resp.bodyToMono(String.class).map(msg ->
                                new RuntimeException("Chroma list HTTP " + resp.statusCode() + ": " + msg)))
                .bodyToMono(Map.class)
                .block();

        if (result == null) return null;
        Object collectionsObj = result.get("collections");
        if (!(collectionsObj instanceof List<?> collections) || collections.isEmpty()) return null;

        Object first = collections.get(0);
        if (first instanceof Map<?,?> m) {
            Object idObj = m.get("id");
            if (idObj instanceof String s && !s.isBlank()) return s;
        }
        return null;
    }

    /**
     * ID yoksa:
     *  1) adla ara,
     *  2) yine yoksa get_or_create ile oluşturup POST cevabından ID çek.
     * Hata fırlatmaz; başarısızsa anlamlı bir RuntimeException üretir (upsert logunda görünür).
     */
    private void ensureCollectionIdLazily() {
        if (this.collectionId != null) return;

        // 1) adla ara
        if (this.collectionName != null) {
            String id = fetchCollectionIdByName(this.collectionName);
            if (id != null) {
                this.collectionId = id;
                System.out.println("Chroma lazy: ID found by name = " + id);
                return;
            }
        }

        // 2) get_or_create dene
        try {
            Map<String, Object> body = Map.of(
                    "name", this.collectionName != null ? this.collectionName : "campus_kg",
                    "get_or_create", true
            );
            Map<?,?> resp = wc().post().uri("/api/v1/collections")
                    .bodyValue(body)
                    .retrieve()
                    .onStatus(s -> s.is4xxClientError() || s.is5xxServerError(),
                            r -> r.bodyToMono(String.class).map(msg ->
                                    new RuntimeException("Chroma lazy ensure HTTP " + r.statusCode() + ": " + msg)))
                    .bodyToMono(Map.class)
                    .block();

            String id = extractIdFromEnsureResponse(resp);
            if (id != null) {
                this.collectionId = id;
                System.out.println("Chroma lazy: ID from POST = " + id);
                return;
            }
        } catch (Exception ex) {
            System.err.println("Chroma lazy ensure ERROR: " + ex.getMessage());
        }

        throw new RuntimeException("Chroma: collectionId elde edilemedi (name=" + this.collectionName + ")");
    }
}
