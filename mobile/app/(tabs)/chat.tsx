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
  Alert,
} from 'react-native';

// Ses ve Dosya işlemleri
import { Audio } from 'expo-av';
// 💥 ÇÖZÜM BURADA: Hata veren writeAsStringAsync metodunu desteklemek için legacy API'yi kullan
import * as FileSystem from 'expo-file-system/legacy';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

type Msg = { id: string; role: 'user' | 'assistant' | 'typing'; text: string };

const API_BASE = process.env.EXPO_PUBLIC_API_URL;

export default function ChatTab() {
  // --- STATE ---
  const [messages, setMessages] = useState<Msg>([
    { id: 'sys', role: 'assistant', text: 'Merhaba! Yazabilir veya konuşabilirsin 🎙️' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // Ses Kayıt
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  const flatListRef = useRef<FlatList>(null);
  const { token, signOut } = useAuth();

  // --- YARDIMCI FONKSİYONLAR ---

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const addMessage = (role: 'user' | 'assistant', text: string) => {
    setMessages(m => [...m, { id: Date.now() + '-' + role[0], role, text }]);
    setTimeout(scrollToBottom, 100);
  };

  // 1. METİN GÖNDERME
  const sendTextMessage = async () => {
    const content = input.trim();
    if (!content || !API_BASE || loading || !token) return;

    addMessage('user', content);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ query: content }),
      });

      await handleApiResponse(res);
    } catch (e: any) {
      addMessage('assistant', 'Hata: ' + (e?.message ?? String(e)));
    } finally {
      setLoading(false);
    }
  };

  // 2. KAYIT BAŞLAT
  const startRecording = async () => {
    try {
      if (permissionResponse?.status !== 'granted') {
        await requestPermission();
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
      console.log('Kayıt başladı');
    } catch {
      Alert.alert('Hata', 'Mikrofon başlatılamadı.');
    }
  };

  // 3. KAYIT DURDUR
  const stopRecording = async () => {
    if (!recording) return;

    console.log('Kayıt durduruluyor...');
    setRecording(null);
    await recording.stopAndUnloadAsync();

    const uri = recording.getURI();
    if (uri) sendVoiceToBackend(uri);
  };

  // 4. BACKEND İSTEĞİ
  const sendVoiceToBackend = async (uri: string) => {
    if (!API_BASE || !token) return;
    setLoading(true);

    try {
      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri: uri,
        type: 'audio/m4a',
        name: 'voice_message.m4a',
      });

      console.log("Ses sunucuya gönderiliyor...");
      const res = await fetch(`${API_BASE}/api/voice/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.status === 401 || res.status === 403) {
        addMessage('assistant', "Oturum süresi doldu.");
        await signOut();
        return;
      }

      if (!res.ok) throw new Error('Sunucu hatası');

      const data = await res.json();

      addMessage('assistant', data.answerText);

      if (data.audioBase64) {
        console.log("Ses verisi alındı, oynatılıyor...");
        await playResponseAudio(data.audioBase64);
      }
    } catch (error: any) {
      console.error("Hata:", error);
      addMessage('assistant', 'Hata: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // 5. SES OYNATMA (NİHAİ ÇÖZÜM)
  const playResponseAudio = async (base64String: string) => {
    let sound: Audio.Sound | null = null;
    try {
      // 1. Hoparlör Moduna Geçiş (KAYIT MODUNU KAPAT)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      const uri = FileSystem.documentDirectory + "voice_response.mp3";

      const cleanBase64 = base64String.replace(/\s/g, '');

      // 2. DOSYAYA YAZMA (legacy API sayesinde artık çalışması bekleniyor)
      await FileSystem.writeAsStringAsync(uri, cleanBase64, {
        encoding: 'base64',
      });

      console.log("Dosya hazır:", uri);

      // 3. Sesi Yükle ve Çal
      ({ sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, volume: 1.0 }
      ));

      // 4. Ses bittiğinde kaynağı serbest bırak
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound?.unloadAsync();
          console.log("Ses çalma işlemi tamamlandı ve bellek serbest bırakıldı.");
        }
      });

      await sound.playAsync();
      console.log("Ses çalıyor olmalı.");
    } catch (error) {
      console.error("SES ÇALMA HATASI KESİN:", error);
      Alert.alert("Ses Hatası", "Ses oynatılamadı. Konsolu kontrol edin.");
      // Hata durumunda da belleği serbest bırakmayı dene
      if (sound) {
        try {
          await sound.unloadAsync();
        } catch (e) {
          console.warn("Ses serbest bırakılamadı:", e);
        }
      }
    }
  };

  const handleApiResponse = async (res: Response) => {
    const ct = res.headers.get('content-type') || '';
    let answer = '';

    if (!res.ok) {
      answer = `Hata: ${res.status}`;
    } else if (ct.includes('application/json')) {
      const data = await res.json();
      answer = data.answer ?? 'Cevap yok.';
    } else {
      answer = await res.text();
    }
    addMessage('assistant', answer);
  };

  // --- RENDER ---
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
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={styles.bubbleText}>{item.text}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen
        options={{
          title: 'Kampüs Asistanı',
          headerRight: () => (
            <TouchableOpacity onPress={signOut} style={{ marginRight: 15 }}>
              <Ionicons name="log-out-outline" size={24} color="#9CA3AF" />
            </TouchableOpacity>
          ),
          headerStyle: { backgroundColor: '#0b1220' },
          headerTintColor: '#FFFFFF',
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 1 : 0}
      >
        <View style={styles.inputContainer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={recording ? "Dinliyorum..." : "Mesaj yaz..."}
            placeholderTextColor="#9CA3AF"
            style={styles.input}
            multiline
            editable={!recording}
          />

          {input.trim().length > 0 ? (
            <TouchableOpacity
              onPress={sendTextMessage}
              disabled={loading}
              style={[styles.sendButton, loading && styles.sendButtonDisabled]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="arrow-up" size={24} color="white" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPressIn={startRecording}
              onPressOut={stopRecording}
              disabled={loading}
              style={[
                styles.micButton,
                recording && styles.micButtonRecording,
                loading && styles.sendButtonDisabled
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name={recording ? "mic" : "mic-outline"} size={24} color="white" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Stil tanımlamaları... (değişmedi)
  container: { flex: 1, backgroundColor: '#111827' },
  listContent: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 10 },
  bubble: { padding: 14, borderRadius: 20, marginBottom: 10, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#374151', borderBottomLeftRadius: 4 },
  bubbleText: { color: 'white', fontSize: 16 },

  inputContainer: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
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

  micButton: {
    backgroundColor: '#007AFF', // Mavi
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },

  micButtonRecording: {
    backgroundColor: '#EF4444', // Kırmızı
    transform: [{ scale: 1.1 }],
  },

  sendButtonDisabled: { opacity: 0.5 },
});