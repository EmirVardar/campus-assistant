package com.campus.backend;

import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Locale; // <-- Bunu import et

@EnableScheduling
@SpringBootApplication
public class BackendApplication {

	public static void main(String[] args) {

        Locale.setDefault(Locale.US); // <-- BU SATIRI EKLE

        SpringApplication.run(BackendApplication.class, args);
	}
    @Bean
    public CommandLineRunner hashGenerator(PasswordEncoder passwordEncoder) {
        // Not: 'passwordEncoder' bean'i SecurityConfig'den otomatik olarak inject edilir
        return args -> {
            String plainPassword = "12345";
            String hashedPassword = passwordEncoder.encode(plainPassword);

            System.out.println("=========================================");
            System.out.println("YENI SIFRE HASH'I ('12345' icin):");
            System.out.println(hashedPassword); // Bu hash $2a$10... ile baslayacak
            System.out.println("=========================================");
        };
    }

}
