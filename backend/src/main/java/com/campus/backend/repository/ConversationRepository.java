package com.campus.backend.repository;

import com.campus.backend.entity.Conversation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ConversationRepository extends JpaRepository<Conversation, Long> {
    Optional<Conversation> findByUserIdAndConversationKey(Long userId, String conversationKey);
}
