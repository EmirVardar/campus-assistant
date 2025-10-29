package com.campus.backend.controller;

import com.campus.backend.etl.AnnouncementClient; // Arayüzün yolu
import com.campus.backend.service.EtlService; // Servisin yolu
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/etl") // Endpoint'in ana yolu
@RequiredArgsConstructor
public class EtlController {
    private final List<AnnouncementClient> clients;
    private final EtlService etl;

    @PostMapping("/run/{source}") // /api/etl/run/cs_sakarya gibi
    public Map<String,Object> run(@PathVariable String source) {
        // Gelen {source} adına göre (örn: "cs_sakarya")
        // listeden doğru istemciyi bulur
        var client = clients.stream()
                .filter(c -> c.getSourceCode().equals(source))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Kaynak bulunamadı: " + source));

        // Sadece o istemci için EtlService'i çalıştırır
        return etl.pull(client);
    }
}
