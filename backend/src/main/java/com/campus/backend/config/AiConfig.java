package com.campus.backend.config;

import dev.langchain4j.model.chat.ChatLanguageModel;
import dev.langchain4j.model.embedding.EmbeddingModel;
import dev.langchain4j.model.openai.OpenAiChatModel;
import dev.langchain4j.model.openai.OpenAiEmbeddingModel;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.function.client.WebClient; // Bunu ekle

import java.time.Duration;

@Configuration
public class AiConfig {

    @Bean
    public ChatLanguageModel chatModel(
            @Value("${app.openai.api-key}") String apiKey,
            @Value("${app.openai.chat-model:gpt-4o-mini}") String modelName
    ) {
        return OpenAiChatModel.builder()
                .apiKey(apiKey)
                .modelName(modelName)
                .temperature(0.2)
                .timeout(Duration.ofSeconds(30))
                .build();
    }

    @Bean
    public EmbeddingModel embeddingModel(
            @Value("${app.openai.api-key}") String apiKey,
            @Value("${app.openai.embedding-model:text-embedding-3-small}") String embeddingModel
    ) {
        return OpenAiEmbeddingModel.builder()
                .apiKey(apiKey)
                .modelName(embeddingModel)
                .timeout(Duration.ofSeconds(30))
                .build();
    }

    // AŞAĞIDAKİ KISMI EKLE:
    @Bean
    public WebClient openAiAudioWebClient(WebClient.Builder builder) {
        return builder
                .baseUrl("https://api.openai.com/v1/audio") // Base URL burada
                .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(16 * 1024 * 1024)) // 16MB Sınır burada
                .build();
    }
}
