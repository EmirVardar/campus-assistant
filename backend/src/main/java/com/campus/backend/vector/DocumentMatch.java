package com.campus.backend.vector;

import java.util.Map;

public record DocumentMatch(String text, Map<String, Object> metadata, double distance) {
}
