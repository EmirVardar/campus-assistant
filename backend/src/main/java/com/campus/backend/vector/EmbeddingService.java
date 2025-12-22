package com.campus.backend.vector;

import com.campus.backend.entity.Announcement;
import com.campus.backend.entity.EmbeddingsMap;
import com.campus.backend.repository.EmbeddingsMapRepository;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.output.Response;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import jakarta.annotation.PostConstruct;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class EmbeddingService {

    private final ChromaClient chroma;
    private final EmbeddingsMapRepository mapRepo;
    private final EmbeddingModel embeddingModel;

    @PostConstruct
    void init(){
        chroma.ensure("campus_kg");
    }

    @Transactional
    public void indexAnnouncement(Announcement a){
        String vid = "ann_" + a.getId();
        if (mapRepo.existsByVectorId(vid) || mapRepo.existsByKindAndRecordId("announcement", a.getId())) {
            return;
        }

        String doc = a.getTitle() + "\n\n" + a.getContent();

        Response<Embedding> response = embeddingModel.embed(doc);
        List<Float> vector = response.content().vectorAsList();

        // ✅ Metadata: title eklemek yararlı (zorunlu değil ama önerilir)
        Map<String, Object> metadata = Map.of(
                "kind", "announcement",
                "id", String.valueOf(a.getId()),
                "title", a.getTitle() != null ? a.getTitle() : "",
                "url", a.getUrl() != null ? a.getUrl() : "",
                "category", a.getCategory() != null ? a.getCategory() : "",
                "published_at", String.valueOf(a.getPublishedAt())
        );

        chroma.upsert("campus_kg", vid, vector, metadata, doc);

        var map = new EmbeddingsMap();
        map.setKind("announcement");
        map.setRecordId(a.getId());
        map.setVectorId(vid);
        mapRepo.save(map);
    }

    @SuppressWarnings("unchecked")
    public List<DocumentMatch> findRelevantDocuments(String query, int topK) {

        Response<Embedding> response = embeddingModel.embed(query);
        List<Float> vector = response.content().vectorAsList();

        Map<?, ?> queryResult = chroma.query(vector, topK);

        List<DocumentMatch> matches = new java.util.ArrayList<>();

        List<List<String>> docLists = (List<List<String>>) queryResult.get("documents");
        List<List<Map<String, Object>>> metaLists = (List<List<Map<String, Object>>>) queryResult.get("metadatas");
        List<List<Double>> distLists = (List<List<Double>>) queryResult.get("distances");

        if (docLists == null || docLists.isEmpty()) {
            return matches;
        }

        List<String> docs = docLists.get(0);
        List<Map<String, Object>> metas = metaLists.get(0);
        List<Double> dists = distLists.get(0);

        for (int i = 0; i < docs.size(); i++) {
            matches.add(new DocumentMatch(
                    docs.get(i),
                    metas.get(i),
                    dists.get(i)
            ));
        }

        // ✅ ZORUNLU: Mesafeye göre sırala (küçük mesafe = daha iyi eşleşme)
        matches.sort((a, b) -> Double.compare(a.distance(), b.distance()));

        return matches;
    }
}
