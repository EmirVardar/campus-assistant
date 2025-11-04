package com.campus.backend.service;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Date;
import java.util.Map;

@Service
public class JwtService {

    @Value("${JWT_SECRET}")
    private String secretBase64;

    @Value("${JWT_EXP_MIN:60}")
    private long expMinutes;

    private SecretKey key;

    @PostConstruct
    void init() {
        byte[] bytes = Decoders.BASE64.decode(secretBase64);
        this.key = Keys.hmacShaKeyFor(bytes);
    }

    public String generateToken(Long userId, String role) {
        Instant now = Instant.now();
        Instant exp = now.plusSeconds(expMinutes * 60);
        return Jwts.builder()
                .setSubject(String.valueOf(userId))
                .addClaims(Map.of("role", role))
                .setIssuedAt(Date.from(now))
                .setExpiration(Date.from(exp))
                .signWith(key)
                .compact();
    }

    public boolean validate(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public String extractUserId(String token) {
        return getAllClaims(token).getSubject();
    }

    public String extractRole(String token) {
        Object r = getAllClaims(token).get("role");
        return r == null ? null : r.toString();
    }

    private Claims getAllClaims(String token) {
        return Jwts.parserBuilder().setSigningKey(key).build()
                .parseClaimsJws(token).getBody();
    }
}

