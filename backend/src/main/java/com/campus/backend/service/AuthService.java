package com.campus.backend.service;

import com.campus.backend.dto.LoginRequest;
import com.campus.backend.dto.LoginResponse;
import com.campus.backend.entity.User;
import com.campus.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.NoSuchElementException;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService; // <— EKLENDİ

    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new NoSuchElementException("user not found"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new IllegalArgumentException("bad credentials");
        }

        String token = jwtService.generateToken(user.getId(), user.getRole().name()); // <— EKLENDİ
        return new LoginResponse(user.getId(), user.getRole().name(), token);         // <— token döndür
    }
}
