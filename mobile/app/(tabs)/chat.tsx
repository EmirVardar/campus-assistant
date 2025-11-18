import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';

// DÜZELTME: SafeAreaView artık BURADAN alınmalı
import { SafeAreaView } from 'react-native-safe-area-context';

import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

type Msg = { id: string; role: 'user' | 'assistant' | 'typing'; text: string };

const API_BASE = process.env.EXPO_PUBLIC_API_URL;

export default function ChatTab() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: 'sys', role: 'assistant', text: 'Merhaba! Bana bir şey yaz :)' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const { token, signOut } = useAuth();

  // DÜZELTME: Eksik olan scroll fonksiyonu eklendi
  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || !API_BASE || loading || !token) return;

    const userMsg: Msg = { id: Date.now() + '-u', role: 'user', text: content };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(scrollToBottom, 100); // DÜZELTME: mesaj eklenince en alta kaydır

    try {
      const res = await fetch(`${API_BASE}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ query: content }),
      });

      const ct = res.headers.get('content-type') || '';
      let answer = '';

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          answer = "Oturum süresi doldu. Lütfen tekrar giriş yapın.";
          await signOut();
        } else {
          answer = `Sunucu hatası: ${res.status}`;
        }
      } else if (ct.includes('application/json')) {
        const data = await res.json();
        answer = data.answer ?? 'Bir hata oluştu.';
      } else {
        answer = await res.text();
      }

      setMessages((m) => [...m, { id: Date.now() + '-a', role: 'assistant', text: answer }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { id: Date.now() + '-e', role: 'assistant', text: 'Hata: ' + (e?.message ?? String(e)) },
      ]);
    } finally {
      setLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  // DÜZELTME: typing bubble için data ayarlama
  const flatListData = useMemo(() => {
    return loading
      ? [...messages, { id: 'typing', role: 'typing', text: '...' }]
      : messages;
  }, [messages, loading]);

  const renderItem = ({ item }: { item: Msg }) => {
    if (item.role === 'typing') {
      return (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      );
    }

    const isUser = item.role === 'user';

    return (
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <Text style={styles.bubbleText}>{item.text}</Text>
      </View>
    );
  };

  return (
    // DÜZELTME: edges={'top'} kullanıldı, bottom Safe Area kaldırıldı → boşluk sorunu çözülür
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          title: 'AI Chat',
          headerRight: () => (
            <TouchableOpacity onPress={signOut} style={{ marginRight: 15 }}>
              <Ionicons name="log-out-outline" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          ),
          headerStyle: { backgroundColor: '#0b1220' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      <FlatList
        ref={flatListRef}
        data={flatListData}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
      />

      {/* DÜZELTME: iOS'ta alttaki boşluğu kaldırmak için offset artırıldı */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 1 : 0}  // ← DÜZELTME
      >
        <View style={styles.inputContainer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Mesaj yaz..."
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline
          />

          <TouchableOpacity
            onPress={sendMessage}
            disabled={loading || input.trim().length === 0}
            style={[
              styles.sendButton,
              (loading || input.trim().length === 0) && styles.sendButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="arrow-up" size={24} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },

  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 10,
  },

  bubble: {
    padding: 14,
    borderRadius: 20,
    marginBottom: 10,
    maxWidth: '85%',
  },

  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#2563eb',
    borderBottomRightRadius: 4,
  },

  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#374151',
    borderBottomLeftRadius: 4,
  },

  bubbleText: { color: 'white', fontSize: 16 },

  // DÜZELTME: Alt boşluk sorunu için paddingVertical azaltıldı
  inputContainer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 6, // ← DÜZELTME
    backgroundColor: '#0b1220',
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },

  input: {
    flex: 1,
    backgroundColor: '#1f2937',
    color: 'white',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    maxHeight: 120,
  },

  sendButton: {
    backgroundColor: '#10B981',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },

  sendButtonDisabled: { opacity: 0.5 },
});
