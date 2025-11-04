package com.campus.backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class LoginResponse {
    private Long userId;
    private String role;
    private String token; // şimdilik null, JwtService gelince dolduracağız
}