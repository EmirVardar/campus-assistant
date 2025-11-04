package com.campus.backend.controller;


import com.campus.backend.dto.LoginRequest;
import com.campus.backend.dto.LoginResponse;
import com.campus.backend.config.LoginRateLimiter;
import com.campus.backend.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final LoginRateLimiter limiter; // IP başına 5/dk basit koruma

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest http) {
        // 1) Rate limit kontrolü (IP bazlı)
        String key = http.getRemoteAddr();
        if (!limiter.allow(key)) {
            return ResponseEntity.status(429).body("too many attempts");
        }

        // 2) Login akışı
        try {
            LoginResponse resp = authService.login(request);
            return ResponseEntity.ok(resp);
        } catch (NoSuchElementException | IllegalArgumentException e) {
            // kullanıcı yok / şifre yanlış → 401
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("invalid credentials");
        }
    }
}
