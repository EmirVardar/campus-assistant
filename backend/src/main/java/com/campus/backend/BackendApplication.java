package com.campus.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.util.Locale; // <-- Bunu import et

@EnableScheduling
@SpringBootApplication
public class BackendApplication {

	public static void main(String[] args) {

        Locale.setDefault(Locale.US); // <-- BU SATIRI EKLE

        SpringApplication.run(BackendApplication.class, args);
	}

}
