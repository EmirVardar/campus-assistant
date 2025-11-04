package com.campus.backend.config;

import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class LoginRateLimiter {
    private static final int LIMIT = 5;            // IP başına 5 deneme
    private static final long WINDOW_MS = 60_000;  // 1 dk

    private static class Bucket { int count; long resetAt; }
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    public boolean allow(String key) {
        long now = Instant.now().toEpochMilli();
        Bucket b = buckets.computeIfAbsent(key, k -> { var nb=new Bucket(); nb.resetAt=now+WINDOW_MS; return nb; });
        if (now > b.resetAt) { b.count = 0; b.resetAt = now + WINDOW_MS; }
        if (b.count >= LIMIT) return false;
        b.count++; return true;
    }
}