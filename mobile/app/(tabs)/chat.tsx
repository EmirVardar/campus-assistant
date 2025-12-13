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
  Linking,
} from 'react-native';

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

type Msg = {
  id: string;
  role: 'user' | 'assistant' | 'typing';
  text: string;
  urls?: string[]; // ✅ linkleri metinden ayrı saklayacağız
};

const API_BASE = process.env.EXPO_PUBLIC_API_URL;

// DEV’de log, prod’da sessiz
const dbg = (...args: any[]) => {
  if (__DEV__) console.log(...args);
};

// Metinden URL yakala
const extractUrls = (text: string): string[] => {
  const matches = text.match(/https?:\/\/\S+/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map(u => u.replace(/[),.]+$/g, ''))));
};

// Cevap metninden kaynak satırını + URL’leri temizle (üstte görünmesin)
const stripSourcesAndUrls = (text: string): string => {
  return text
    .replace(/\s*Kaynaklar?:.*$/i, '') // "Kaynak:" veya "Kaynaklar:" ile başlayan SON kısmı kırp
    .replace(/https?:\/\/\S+/g, '')    // güvenlik: URL kaldıysa sil
    .trim();
};

export default function ChatTab() {
  const [messages, setMessages] = useState<Msg>([
    { id: 'sys', role: 'assistant', text: 'Merhaba! Yazabilir veya konuşabilirsin 🎙️' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  const flatListRef = useRef<FlatList>(null);
  const { token, signOut } = useAuth();

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const addMessage = (role: 'user' | 'assistant', text: string, urls?: string[]) => {
    setMessages(m => [...m, { id: Date.now() + '-' + role[0], role, text, urls }]);
    setTimeout(scrollToBottom, 100);
  };

  // 1) TEXT
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
          Authorization: `Bearer ${token}`,
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

  // 2) START REC
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
      dbg('Kayıt başladı');
    } catch {
      Alert.alert('Hata', 'Mikrofon başlatılamadı.');
    }
  };

  // 3) STOP REC
  const stopRecording = async () => {
    if (!recording) return;

    dbg('Kayıt durduruluyor...');
    setRecording(null);
    await recording.stopAndUnloadAsync();

    const uri = recording.getURI();
    if (uri) sendVoiceToBackend(uri);
  };

  // 4) VOICE -> BACKEND
  const sendVoiceToBackend = async (uri: string) => {
    if (!API_BASE || !token) return;
    setLoading(true);

    try {
      const formData = new FormData();
      // @ts-ignore
      formData.append('file', {
        uri,
        type: 'audio/m4a',
        name: 'voice_message.m4a',
      });

      dbg('Ses sunucuya gönderiliyor...');

      const res = await fetch(`${API_BASE}/api/voice/ask`, {
        method: 'POST',
        headers: {
          // ✅ FormData’da Content-Type'ı elle set ETME (boundary sorunu)
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.status === 401 || res.status === 403) {
        addMessage('assistant', 'Oturum süresi doldu.');
        await signOut();
        return;
      }
      if (!res.ok) throw new Error('Sunucu hatası');

      const data = await res.json();

      // ✅ Base64’ü ASLA loglama
      dbg('VoiceResponse (safe):', {
        answerLen: data?.answer?.length ?? 0,
        emotion: data?.emotion,
        audioBase64Len: data?.audioBase64?.length ?? 0,
        hasAudio: Boolean(data?.audioBase64),
      });

      const answerText: string = data.answer ?? 'Cevap alınamadı.';
      const emotion: string | undefined = data.emotion;

      // ✅ Linkleri yakala
      const urls = extractUrls(answerText);

      // ✅ Üst metinden link ve kaynak satırını çıkar
      const cleanedAnswer = stripSourcesAndUrls(answerText);

      const fullText = emotion ? `${cleanedAnswer}\n\n[Duygu: ${emotion}]` : cleanedAnswer;

      // ✅ urls artık metinden değil mesajdan gelecek
      addMessage('assistant', fullText, urls);

      if (data.audioBase64) {
        dbg('Ses verisi alındı (len=', data.audioBase64.length, ')');
        await playResponseAudio(data.audioBase64);
      }
    } catch (error: any) {
      console.error('Hata:', error);
      addMessage('assistant', 'Hata: ' + (error?.message ?? String(error)));
    } finally {
      setLoading(false);
    }
  };

  // 5) PLAY AUDIO
  const playResponseAudio = async (base64String: string) => {
    let sound: Audio.Sound | null = null;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      const uri = FileSystem.documentDirectory + 'voice_response.mp3';
      const cleanBase64 = base64String.replace(/\s/g, '');

      await FileSystem.writeAsStringAsync(uri, cleanBase64, { encoding: 'base64' });
      dbg('Dosya hazır:', uri);

      ({ sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 1.0 }));

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound?.unloadAsync();
          dbg('Ses çalma tamamlandı, bellek serbest.');
        }
      });

      await sound.playAsync();
      dbg('Ses çalıyor.');
    } catch (error) {
      console.error('SES ÇALMA HATASI:', error);
      Alert.alert('Ses Hatası', 'Ses oynatılamadı. Konsolu kontrol edin.');
      if (sound) {
        try { await sound.unloadAsync(); } catch {}
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

    // İstersen text endpoint için de linkleri altta göstermek:
    // const urls = extractUrls(answer);
    // const cleaned = stripSourcesAndUrls(answer);
    // addMessage('assistant', cleaned, urls);

    addMessage('assistant', answer);
  };

  // --- RENDER ---
  const flatListData = useMemo(() => {
    return loading ? [...messages, { id: 'typing', role: 'typing', text: '...' }] : messages;
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
    const urls = !isUser ? (item.urls ?? []) : []; // ✅ artık metinden çekmiyoruz

    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={styles.bubbleText} selectable>
          {item.text}
        </Text>

        {!isUser && urls.length > 0 && (
          <View style={{ marginTop: 10 }}>
            {urls.slice(0, 2).map((url) => (
              <View key={url} style={{ marginTop: 6 }}>
                <TouchableOpacity onPress={() => Linking.openURL(url)}>
                  <Text style={styles.linkText} selectable>
                    {url}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setStringAsync(url);
                    Alert.alert('Kopyalandı', 'Link panoya kopyalandı.');
                  }}
                  style={{ marginTop: 4 }}
                >
                  <Text style={styles.copyText}>Linki kopyala</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
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
            placeholder={recording ? 'Dinliyorum...' : 'Mesaj yaz...'}
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
                loading && styles.sendButtonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name={recording ? 'mic' : 'mic-outline'} size={24} color="white" />
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827' },
  listContent: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 10 },
  bubble: { padding: 14, borderRadius: 20, marginBottom: 10, maxWidth: '85%' },
  userBubble: { alignSelf: 'flex-end', backgroundColor: '#2563eb', borderBottomRightRadius: 4 },
  assistantBubble: { alignSelf: 'flex-start', backgroundColor: '#374151', borderBottomLeftRadius: 4 },
  bubbleText: { color: 'white', fontSize: 16 },

  linkText: {
    color: '#93C5FD',
    textDecorationLine: 'underline',
    fontSize: 14,
  },
  copyText: {
    color: '#E5E7EB',
    fontSize: 13,
    opacity: 0.85,
  },

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
    backgroundColor: '#007AFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },

  micButtonRecording: {
    backgroundColor: '#EF4444',
    transform: [{ scale: 1.1 }],
  },

  sendButtonDisabled: { opacity: 0.5 },
});
