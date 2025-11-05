package com.campus.backend.dto;


public class ChatResponse {
    private String answer;

    public ChatResponse(String answer) {
        this.answer = answer;
    }

    // Getter
    public String getAnswer() {
        return answer;
    }

    // Setter (Opsiyonel, ama ekleyelim)
    public void setAnswer(String answer) {
        this.answer = answer;
    }
}
