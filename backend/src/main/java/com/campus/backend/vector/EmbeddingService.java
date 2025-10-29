package com.campus.backend.vector;

import com.campus.backend.entity.Announcement;
import com.campus.backend.entity.EmbeddingsMap;
import com.campus.backend.repository.EmbeddingsMapRepository;
import dev.langchain4j.data.embedding.Embedding;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.output.Response; // <-- YENİ IMPORT
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

        // 1. Belgeyi (metni) oluştur
        String doc = a.getTitle()+"\n\n"+a.getContent();

        // ===== HATALI KISIM DÜZELTİLDİ =====

        // 2. YENİ: Metni OpenAI kullanarak vektöre çevir
        // Bu komut 'Response<Embedding>' döndürür
        Response<Embedding> response = embeddingModel.embed(doc);

        // 3. 'Response' zarfının içinden '.content()' ile asıl embedding'i al
        //    ve '.vectorAsList()' ile listeye çevir
        List<Float> vector = response.content().vectorAsList();

        // ===== DÜZELTME BİTTİ =====

        // 4. Metadata'yı hazırla
// YENİ DÜZELTME: Chroma'nın sayısal değerlerde hata vermemesi için
// 'id' de dahil olmak üzere her şeyi String'e çeviriyoruz.
        Map<String, Object> metadata = Map.of(
                "kind", "announcement",
                "id", String.valueOf(a.getId()), // <-- HATA BURADAYDI, Long'u String'e çevirdik
                "url", a.getUrl() != null ? a.getUrl() : "",
                "category", a.getCategory() != null ? a.getCategory() : "",
                "published_at", String.valueOf(a.getPublishedAt()) // Bu zaten String'di
        );

        // 5. Chroma'ya 'vector', 'metadata' VE 'doc' (metni) gönder
        chroma.upsert("campus_kg", vid, vector, metadata, doc); // <-- 'doc' geri eklendi

        // 6. Haritayı kaydet
        var map = new EmbeddingsMap();
        map.setKind("announcement");
        map.setRecordId(a.getId());
        map.setVectorId(vid);
        mapRepo.save(map);
    }
}