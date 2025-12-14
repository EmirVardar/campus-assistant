package com.campus.backend.controller;

import com.campus.backend.dto.PreferenceFeedbackRequest;
import com.campus.backend.dto.UserPreferenceResponse;
import com.campus.backend.entity.UserPreference;
import com.campus.backend.service.UserPreferenceService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/preferences")
@RequiredArgsConstructor
public class UserPreferenceController {

    private final UserPreferenceService service;

    @GetMapping("/me")
    public ResponseEntity<UserPreferenceResponse> me() {
        Long userId = currentUserId();
        UserPreference p = service.getOrCreate(userId);
        return ResponseEntity.ok(toResponse(p));
    }

    @PostMapping("/feedback")
    public ResponseEntity<UserPreferenceResponse> feedback(@RequestBody PreferenceFeedbackRequest req) {
        Long userId = currentUserId();
        UserPreference p = service.applyFeedback(userId, req.getTags());
        return ResponseEntity.ok(toResponse(p));
    }

    private Long currentUserId() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || auth.getPrincipal() == null) {
            throw new IllegalStateException("Unauthenticated");
        }
        return Long.valueOf(auth.getPrincipal().toString()); // JwtAuthFilter principal=userId
    }

    private UserPreferenceResponse toResponse(UserPreference p) {
        return new UserPreferenceResponse(
                p.getUserId(),
                p.getVerbosity(),
                p.isCitations(),
                p.getFormat(),
                p.getTone(),
                p.getVerbosityScore(),
                p.getCitationsScore(),
                p.getFormatScore(),
                p.getToneScore()
        );
    }
}
