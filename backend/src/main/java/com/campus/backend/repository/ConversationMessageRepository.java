package com.campus.backend.repository;

import com.campus.backend.entity.ConversationMessage;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConversationMessageRepository extends JpaRepository<ConversationMessage, Long> {

    Page<ConversationMessage> findByConversation_IdOrderByCreatedAtDesc(Long conversationId, Pageable pageable);
}

