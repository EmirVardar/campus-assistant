import React, { useState, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet, // StyleSheet import ediyoruz
  SafeAreaView, // Ekranın üst kısmıyla çakışmayı önler
} from "react-native";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons"; // İkonlar için

type Msg = { id: string; role: "user" | "assistant" | "typing"; text: string };
const API_BASE = process.env.EXPO_PUBLIC_API_URL;

export default function ChatTab() {
  const [messages, setMessages] = useState<Msg[]>([
    { id: "sys", role: "assistant", text: "Merhaba! Bana bir şey yaz :)" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null); // FlatList'i kontrol etmek için ref

  // Mesaj gönderildiğinde veya geldiğinde en alta kaydır
  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || !API_BASE || loading) return;

    const userMsg: Msg = { id: Date.now() + "-u", role: "user", text: content };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);

    // Yeni mesaj sonrası kaydırma
    setTimeout(scrollToBottom, 100);

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });

      const ct = res.headers.get("content-type") || "";
      let answer = "";
      if (ct.includes("application/json")) {
        const data = await res.json();
        answer = data.answer ?? data.content ?? data.message ?? JSON.stringify(data);
      } else {
        answer = await res.text();
      }

      const botMsg: Msg = { id: Date.now() + "-a", role: "assistant", text: answer };
      setMessages((m) => [...m, botMsg]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        { id: Date.now() + "-e", role: "assistant", text: "Hata: " + (e?.message ?? String(e)) },
      ]);
    } finally {
      setLoading(false);
      // Cevap sonrası kaydırma
      setTimeout(scrollToBottom, 100);
    }
  };

  // "Yazıyor..." göstergesini de içeren memoized data
  const flatListData = useMemo(() => {
    if (loading) {
      return [...messages, { id: "typing", role: "typing", text: "..." }];
    }
    return messages;
  }, [messages, loading]);

  // Mesaj balonlarını render eden fonksiyon
  const renderItem = ({ item }: { item: Msg }) => {
    // "Yazıyor..." göstergesi
    if (item.role === "typing") {
      return (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <ActivityIndicator size="small" color="#FFFFFF" />
        </View>
      );
    }

    const isUser = item.role === "user";
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
    // SafeAreaView, çentik (notch) gibi alanları hesaba katar
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: "AI Chat" }} />

      <FlatList
        ref={flatListRef}
        data={flatListData}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // İçerik değişiminde veya ilk açılışta en alta kaydır
        onContentSizeChange={scrollToBottom}
        onLayout={scrollToBottom}
      />

      {/* Klavye açıldığında input alanını yukarı iter */}
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0} // Header yüksekliği için offset
      >
        <View style={styles.inputContainer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Mesaj yaz..."
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline // Çok satırlı input
          />
          <TouchableOpacity
            onPress={sendMessage}
            disabled={loading || input.trim().length === 0} // Boşken veya yüklenirken butonu pasif yap
            style={[
              styles.sendButton,
              (loading || input.trim().length === 0) && styles.sendButtonDisabled,
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              // "Gönder" yazısı yerine ikon kullandık
              <Ionicons name="arrow-up" size={24} color="white" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Tüm stilleri tek bir yerde topladık
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#111827", // Ana arka plan
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 10, // Input alanı ile arasında boşluk
    paddingTop: 10,
  },
  bubble: {
    padding: 14,
    borderRadius: 20, // Daha yuvarlak köşeler
    marginBottom: 10,
    maxWidth: "85%",
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#2563eb", // Kullanıcı balonu rengi
    borderBottomRightRadius: 4, // "Kuyruk" efekti
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#374151", // Asistan balonu rengi
    borderBottomLeftRadius: 4, // "Kuyruk" efekti
  },
  bubbleText: {
    color: "white",
    fontSize: 16,
  },
  inputContainer: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-end", // Çok satırlı inputta hizalama için
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0b1220", // Input bar arka planı
    borderTopWidth: 1,
    borderTopColor: "#1f2937",
  },
  input: {
    flex: 1,
    backgroundColor: "#1f2937",
    color: "white",
    borderRadius: 20, // Daha yuvarlak input
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 120, // Inputun çok uzamasını engeller
  },
  sendButton: {
    backgroundColor: "#10b981", // Gönder butonu rengi
    width: 44,
    height: 44,
    borderRadius: 22, // Tam daire
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 2, // Input ile hizalamak için
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});