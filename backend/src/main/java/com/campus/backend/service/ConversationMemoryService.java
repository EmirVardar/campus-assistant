package com.campus.backend.service;

import com.campus.backend.entity.*;
import com.campus.backend.repository.ConversationMessageRepository;
import com.campus.backend.repository.ConversationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ConversationMemoryService {

    private final ConversationRepository conversationRepository;
    private final ConversationMessageRepository messageRepository;

    @Transactional
    public Conversation getOrCreate(Long userId, String conversationKey) {
        return conversationRepository.findByUserIdAndConversationKey(userId, conversationKey)
                .orElseGet(() -> {
                    Conversation c = new Conversation();
                    c.setUserId(userId);
                    c.setConversationKey(conversationKey);
                    return conversationRepository.save(c);
                });
    }

    @Transactional(readOnly = true)
    public List<ConversationMessage> getLastMessages(Long conversationId, int limit) {
        var page = messageRepository.findByConversation_IdOrderByCreatedAtDesc(
                conversationId,
                PageRequest.of(0, limit)
        );

        // page.getContent() unmodifiable olabildiği için önce kopya alıyoruz
        List<ConversationMessage> desc = new ArrayList<>(page.getContent());
        Collections.reverse(desc); // kronolojik sıraya çevir
        return desc;
    }

    @Transactional
    public void append(Conversation conversation, ConversationMessageRole role, String content) {
        if (conversation == null) return;
        if (content == null) content = "";

        ConversationMessage m = new ConversationMessage();
        m.setConversation(conversation);
        m.setRole(role);
        m.setContent(content);
        messageRepository.save(m);
    }
}
