package com.campus.backend.entity;

import jakarta.persistence.*;
import lombok.Data;
import lombok.Getter;

@Entity
@Data
@Table(name="sources", indexes = @Index(columnList="code", unique = true))
public class Source {
    @Id
    @GeneratedValue(strategy=GenerationType.IDENTITY)
    private Integer id;
    @Column(nullable=false, unique=true, length=64)
    private String code;  // "muys","obs"
    @Column(nullable=false, length=128)
    private String name;
    private String baseUrl;
}

