import React, { useEffect, useState, useRef, useMemo } from 'react';
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
  Modal,
  Pressable,
} from 'react-native';

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';

import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

type Msg = {
  id: string;
  role: 'user' | 'assistant' | 'typing';
  text: string;
  urls?: string[];
  feedback?: 'like' | 'dislike';
  emotion?: string;
};

const API_BASE = process.env.EXPO_PUBLIC_API_URL;

const dbg = (...args: any[]) => {
  if (__DEV__) console.log(...args);
};

const extractUrls = (text: string): string[] => {
  const matches = text.match(/https?:\/\/\S+/g);
  if (!matches) return [];
  return Array.from(new Set(matches.map((u) => u.replace(/[),.]+$/g, ''))));
};

const stripSourcesAndUrls = (text: string): string => {
  return text.replace(/\s*Kaynaklar?:.*$/i, '').replace(/https?:\/\/\S+/g, '').trim();
};

const formatEmotion = (e?: string) => {
  if (!e) return '';
  const s = String(e).trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const timeLabel = () => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

export default function ChatTab() {
  const headerHeight = useHeaderHeight();

  // ✅ Composer yüksekliği (FlatList paddingBottom için)
  const [composerHeight, setComposerHeight] = useState(0);

  const [messages, setMessages] = useState<Msg>([
    { id: 'sys', role: 'assistant', text: 'Merhaba! Yazabilir veya konuşabilirsin.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  const flatListRef = useRef<FlatList>(null);
  const { token, signOut } = useAuth();

  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackTargetMsgId, setFeedbackTargetMsgId] = useState<string | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<Record<string, boolean>>({});

  const [inputFocused, setInputFocused] = useState(false);

  const scrollToBottom = () => {
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const addMessage = (role: 'user' | 'assistant', text: string, urls?: string[], emotion?: string) => {
    setMessages((m) => [...m, { id: Date.now() + '-' + role[0], role, text, urls, emotion }]);
    setTimeout(scrollToBottom, 120);
  };

  const markMessageFeedback = (msgId: string, feedback: 'like' | 'dislike') => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, feedback } : m)));
  };

  const sendPreferenceFeedback = async (tags: string[]) => {
    if (!API_BASE || !token) throw new Error('API veya token yok.');

    const res = await fetch(`${API_BASE}/api/v1/preferences/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tags }),
    });

    if (res.status === 401 || res.status === 403) {
      Alert.alert('Oturum', 'Oturum süresi doldu.');
      await signOut();
      throw new Error('Unauthorized');
    }
    if (!res.ok) throw new Error(`Preference update failed: ${res.status}`);

    return await res.json();
  };

  const reasonToTags = (reasons: Record<string, boolean>): string[] => {
    const tags: string[] = [];
    if (reasons.tooLong) tags.push('KISA_ISTIYORUM');
    if (reasons.tooShort) tags.push('NORMAL_ISTIYORUM');

    if (reasons.wantSources) tags.push('KAYNAK_ISTIYORUM');
    if (reasons.noSources) tags.push('KAYNAK_ISTEMIYORUM');

    if (reasons.wantSteps) tags.push('ADIM_ADIM');
    if (reasons.noSteps) tags.push('FORMAT_DEFAULT');

    if (reasons.wantTechnical) tags.push('TEKNIK_ANLAT');
    if (reasons.wantSimple) tags.push('BASIT_ANLAT');
    return tags;
  };

  const onLike = async (msgId: string) => {
    markMessageFeedback(msgId, 'like');
  };

  const onDislikeOpen = (msgId: string) => {
    setFeedbackTargetMsgId(msgId);
    setSelectedReasons({});
    setFeedbackModalVisible(true);
  };

  const onDislikeSubmit = async () => {
    if (!feedbackTargetMsgId) return;

    const tags = reasonToTags(selectedReasons);
    if (tags.length === 0) {
      Alert.alert('Seçim gerekli', 'En az bir neden seçmelisin.');
      return;
    }

    try {
      await sendPreferenceFeedback(tags);
      markMessageFeedback(feedbackTargetMsgId, 'dislike');
      setFeedbackModalVisible(false);
      setFeedbackTargetMsgId(null);
    } catch (e: any) {
      Alert.alert('Hata', e?.message ?? String(e));
    }
  };

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

  const startRecording = async () => {
    try {
      if (permissionResponse?.status !== 'granted') {
        await requestPermission();
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      dbg('Kayıt başladı');
    } catch {
      Alert.alert('Hata', 'Mikrofon başlatılamadı.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    dbg('Kayıt durduruluyor...');
    setRecording(null);
    await recording.stopAndUnloadAsync();

    const uri = recording.getURI();
    if (uri) sendVoiceToBackend(uri);
  };

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

      const res = await fetch(`${API_BASE}/api/voice/ask`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.status === 401 || res.status === 403) {
        addMessage('assistant', 'Oturum süresi doldu.');
        await signOut();
        return;
      }
      if (!res.ok) throw new Error('Sunucu hatası');

      const data = await res.json();

      const answerText: string = data.answer ?? 'Cevap alınamadı.';
      const urls = extractUrls(answerText);
      const cleanedAnswer = stripSourcesAndUrls(answerText);

      addMessage('assistant', cleanedAnswer, urls, data?.emotion);

      if (data.audioBase64) {
        await playResponseAudio(data.audioBase64);
      }
    } catch (error: any) {
      console.error('Hata:', error);
      addMessage('assistant', 'Hata: ' + (error?.message ?? String(error)));
    } finally {
      setLoading(false);
    }
  };

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

      ({ sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true, volume: 1.0 }));

      sound.setOnPlaybackStatusUpdate((status) => {
        // @ts-ignore
        if (status.isLoaded && status.didJustFinish) {
          sound?.unloadAsync();
        }
      });

      await sound.playAsync();
    } catch (error) {
      console.error('SES ÇALMA HATASI:', error);
      Alert.alert('Ses Hatası', 'Ses oynatılamadı.');
      if (sound) {
        try {
          await sound.unloadAsync();
        } catch {}
      }
    }
  };

  const handleApiResponse = async (res: Response) => {
    const ct = res.headers.get('content-type') || '';
    let answer = '';
    let emotion: string | undefined = undefined;

    if (!res.ok) {
      answer = `Hata: ${res.status}`;
    } else if (ct.includes('application/json')) {
      const data = await res.json();
      answer = data.answer ?? 'Cevap yok.';
      emotion = data?.emotion;
    } else {
      answer = await res.text();
    }

    const urls = extractUrls(answer);
    const cleaned = stripSourcesAndUrls(answer);

    addMessage('assistant', cleaned, urls, emotion);
  };

  const flatListData = useMemo(() => {
    return loading ? [...messages, { id: 'typing', role: 'typing', text: '...' }] : messages;
  }, [messages, loading]);

  const renderItem = ({ item }: { item: Msg }) => {
    if (item.role === 'typing') {
      return (
        <View style={[styles.bubble, styles.assistantBubble]}>
          <View style={styles.msgMetaRow}>
            <View style={[styles.metaChip, styles.metaChipAssistant]}>
              <Ionicons name="sparkles-outline" size={12} color="rgba(15,23,42,0.70)" />
              <Text style={styles.metaChipTextAssistant}>Asistan</Text>
            </View>
            <Text style={styles.metaTimeText}>{timeLabel()}</Text>
          </View>

          <View style={{ marginTop: 10 }}>
            <ActivityIndicator size="small" color="rgba(15,23,42,0.60)" />
          </View>
        </View>
      );
    }

    const isUser = item.role === 'user';
    const urls = !isUser ? item.urls ?? [] : [];

    const canFeedback = !isUser && item.role === 'assistant' && item.id !== 'sys';
    const feedbackDisabled = Boolean(item.feedback);

    const showEmotion = !isUser && item.role === 'assistant' && item.id !== 'sys' && Boolean(item.emotion);

    return (
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <View style={styles.msgMetaRow}>
          <View style={[styles.metaChip, isUser ? styles.metaChipUser : styles.metaChipAssistant]}>
            <Ionicons
              name={isUser ? 'person-outline' : 'sparkles-outline'}
              size={12}
              color="rgba(15,23,42,0.70)"
            />
            <Text style={isUser ? styles.metaChipTextUser : styles.metaChipTextAssistant}>
              {isUser ? 'Sen' : 'Asistan'}
            </Text>
          </View>
          <Text style={styles.metaTimeText}>{timeLabel()}</Text>
        </View>

        <Text style={[styles.bubbleText, isUser ? styles.userText : styles.assistantText]} selectable>
          {item.text}
        </Text>

        {showEmotion && (
          <View style={styles.badgeRow}>
            <View style={styles.emotionBadge}>
              <Ionicons name="pulse-outline" size={12} color="rgba(15,23,42,0.65)" />
              <Text style={styles.emotionBadgeText}>{formatEmotion(item.emotion)}</Text>
            </View>
          </View>
        )}

        {!isUser && urls.length > 0 && (
          <View style={styles.sourcesBox}>
            <View style={styles.sourcesTitleRow}>
              <Ionicons name="link-outline" size={14} color="rgba(2,132,199,0.85)" />
              <Text style={styles.sourcesTitle}>Bağlantılar</Text>
            </View>

            {urls.slice(0, 2).map((url) => (
              <View key={url} style={styles.sourceRow}>
                <TouchableOpacity onPress={() => Linking.openURL(url)} activeOpacity={0.85}>
                  <Text style={styles.linkText} selectable numberOfLines={2}>
                    {url}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setStringAsync(url);
                    Alert.alert('Kopyalandı', 'Link panoya kopyalandı.');
                  }}
                  style={styles.copyBtn}
                  activeOpacity={0.85}
                >
                  <Ionicons name="copy-outline" size={14} color="rgba(15,23,42,0.70)" />
                  <Text style={styles.copyText}>Kopyala</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {canFeedback && (
          <View style={styles.feedbackRow}>
            <TouchableOpacity
              disabled={feedbackDisabled}
              onPress={() => onLike(item.id)}
              style={[styles.iconBtn, feedbackDisabled && styles.iconBtnDisabled]}
              activeOpacity={0.85}
            >
              <Ionicons name="thumbs-up-outline" size={18} color="rgba(15,23,42,0.70)" />
            </TouchableOpacity>

            <TouchableOpacity
              disabled={feedbackDisabled}
              onPress={() => onDislikeOpen(item.id)}
              style={[styles.iconBtn, feedbackDisabled && styles.iconBtnDisabled]}
              activeOpacity={0.85}
            >
              <Ionicons name="thumbs-down-outline" size={18} color="rgba(15,23,42,0.70)" />
            </TouchableOpacity>

            {item.feedback && (
              <View style={styles.feedbackChip}>
                <Ionicons name="checkmark-circle-outline" size={14} color="#16A34A" />
                <Text style={styles.feedbackChipText}>Geri bildirim alındı</Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen
        options={{
          title: 'Kampüs Asistanı',
          headerStyle: { backgroundColor: '#F8FAFC' },
          headerShadowVisible: false,
          headerTintColor: '#0F172A',
          headerTitleStyle: { fontWeight: '700' },

          // ✅ Sağ üstte logout (login temasındaki gibi “chip”)
          headerRight: () => (
            <TouchableOpacity
              onPress={async () => {
                Alert.alert('Çıkış', 'Oturumu kapatmak istiyor musun?', [
                  { text: 'İptal', style: 'cancel' },
                  { text: 'Çıkış Yap', style: 'destructive', onPress: () => signOut() },
                ]);
              }}
              style={{ marginRight: 14 }}
              activeOpacity={0.85}
            >
              <View style={styles.logoutBtn}>
                <Ionicons name="log-out-outline" size={18} color="rgba(15,23,42,0.75)" />
              </View>
            </TouchableOpacity>
          ),
        }}
      />

      {/* White background + subtle glows */}
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <FlatList
          ref={flatListRef}
          data={flatListData}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          removeClippedSubviews={false}
          onContentSizeChange={scrollToBottom}
          onLayout={scrollToBottom}
          contentContainerStyle={[
            styles.listContent,
            // ✅ En alttaki mesaj composer altında kalmasın
            { paddingBottom: composerHeight + 12 },
          ]}
        />

        {/* Dislike Modal */}
        <Modal
          visible={feedbackModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setFeedbackModalVisible(false)}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setFeedbackModalVisible(false)}>
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <View style={styles.modalHandle} />

              <Text style={styles.modalTitle}>Neden kötüydü?</Text>
              <Text style={styles.modalSub}>
                Seçimlerin, bir sonraki cevap stilini iyileştirmemize yardımcı olur.
              </Text>

              <View style={styles.optionsWrap}>
                {[
                  { key: 'tooLong', label: 'Çok uzundu' },
                  { key: 'tooShort', label: 'Çok kısaydı' },
                  { key: 'wantSteps', label: 'Adım adım olsun' },
                  { key: 'noSteps', label: 'Adım adım olmasın' },
                  { key: 'wantTechnical', label: 'Daha teknik olsun' },
                  { key: 'wantSimple', label: 'Daha basit olsun' },
                  { key: 'wantSources', label: 'Kaynak istiyorum' },
                  { key: 'noSources', label: 'Kaynak istemiyorum' },
                ].map((opt) => {
                  const checked = Boolean(selectedReasons[opt.key]);
                  return (
                    <Pressable
                      key={opt.key}
                      onPress={() => setSelectedReasons((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                      style={[styles.optionRow, checked && styles.optionRowChecked]}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        <Ionicons
                          name={checked ? 'checkmark' : 'add'}
                          size={14}
                          color={checked ? '#0F172A' : 'rgba(15,23,42,0.35)'}
                        />
                      </View>
                      <Text style={styles.optionText}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setFeedbackModalVisible(false)}
                  style={[styles.actionBtn, styles.actionBtnGhost]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionTextGhost}>İptal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onDislikeSubmit}
                  style={[styles.actionBtn, styles.actionBtnPrimary]}
                  activeOpacity={0.85}
                >
                  <Text style={styles.actionTextPrimary}>Gönder</Text>
                  <Ionicons name="arrow-forward-outline" size={16} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ✅ Composer */}
        <View
          onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}
          style={[styles.composerWrap, { paddingBottom: 10 }]}
        >
          <View style={[styles.composer, inputFocused && styles.composerFocused]}>
            <Ionicons
              name={recording ? 'radio-outline' : 'chatbubble-ellipses-outline'}
              size={18}
              color={recording ? 'rgba(185, 28, 28, 0.80)' : 'rgba(15,23,42,0.45)'}
              style={{ marginLeft: 12 }}
            />

            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder={recording ? 'Dinliyorum...' : 'Mesaj yaz...'}
              placeholderTextColor="rgba(15,23,42,0.35)"
              style={styles.input}
              multiline
              editable={!recording}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
            />

            {input.trim().length > 0 ? (
              <TouchableOpacity
                onPress={sendTextMessage}
                disabled={loading}
                style={[styles.roundBtn, styles.roundBtnPrimary, loading && styles.roundBtnDisabled]}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPressIn={startRecording}
                onPressOut={stopRecording}
                disabled={loading}
                style={[
                  styles.roundBtn,
                  recording ? styles.roundBtnDanger : styles.roundBtnBlue,
                  loading && styles.roundBtnDisabled,
                ]}
                activeOpacity={0.9}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name={recording ? 'mic' : 'mic-outline'} size={20} color="#FFFFFF" />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ✅ Apple-like base
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#F8FAFC' },
  glowTop: {
    position: 'absolute',
    top: -160,
    left: -140,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -180,
    right: -150,
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.10)',
  },

  listContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },

  // ✅ header right logout chip
  logoutBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  // ✅ bubbles (white + subtle borders, Apple-ish)
  bubble: {
    padding: 14,
    borderRadius: 18,
    marginBottom: 12,
    maxWidth: '88%',
    borderWidth: 1,
  },

  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: 'rgba(2, 132, 199, 0.10)', // calm blue tint
    borderColor: 'rgba(2, 132, 199, 0.16)',
  },

  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(15, 23, 42, 0.10)',

    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  bubbleText: {
    fontSize: 15.6,
    lineHeight: 21,
    marginTop: 8,
    fontWeight: '500',
  },
  userText: { color: '#0F172A' },
  assistantText: { color: '#0F172A' },

  msgMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  metaChipUser: {
    borderColor: 'rgba(2, 132, 199, 0.16)',
    backgroundColor: 'rgba(2, 132, 199, 0.08)',
  },
  metaChipAssistant: {
    borderColor: 'rgba(22, 163, 74, 0.16)',
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
  },

  metaChipTextUser: {
    color: 'rgba(15,23,42,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  metaChipTextAssistant: {
    color: 'rgba(15,23,42,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },

  metaTimeText: {
    color: 'rgba(15,23,42,0.45)',
    fontSize: 12,
    fontWeight: '500',
  },

  badgeRow: { marginTop: 10, flexDirection: 'row' },
  emotionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  emotionBadgeText: {
    color: 'rgba(15,23,42,0.70)',
    fontSize: 12,
    fontWeight: '600',
  },

  // ✅ sources box (white card inside bubble)
  sourcesBox: {
    marginTop: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(248, 250, 252, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 10,
  },
  sourcesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sourcesTitle: {
    color: 'rgba(2,132,199,0.85)',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  sourceRow: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.06)',
  },
  linkText: {
    color: 'rgba(2,132,199,0.90)',
    textDecorationLine: 'underline',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
  },
  copyBtn: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  },
  copyText: {
    color: 'rgba(15,23,42,0.70)',
    fontSize: 12,
    fontWeight: '600',
  },

  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: { opacity: 0.35 },

  feedbackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.16)',
  },
  feedbackChipText: {
    color: 'rgba(15,23,42,0.70)',
    fontSize: 12,
    fontWeight: '600',
  },

  // ✅ composer (white pill)
  composerWrap: {
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: 'rgba(248,250,252,0.72)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(15,23,42,0.08)',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    paddingVertical: 10,
    paddingRight: 10,

    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },
  composerFocused: {
    borderColor: 'rgba(2, 132, 199, 0.25)',
    shadowColor: '#0284C7',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  input: {
    flex: 1,
    color: '#0F172A',
    fontSize: 15.5,
    lineHeight: 20,
    paddingHorizontal: 10,
    paddingVertical: 10,
    minHeight: 44,
    maxHeight: 120,
    fontWeight: '500',
  },

  // ✅ round action button (dark primary / blue mic)
  roundBtn: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,

    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  roundBtnPrimary: {
    backgroundColor: '#0F172A',
    borderColor: 'rgba(15,23,42,0.10)',
  },
  roundBtnBlue: {
    backgroundColor: 'rgba(2,132,199,0.90)',
    borderColor: 'rgba(2,132,199,0.25)',
  },
  roundBtnDanger: {
    backgroundColor: 'rgba(185,28,28,0.90)',
    borderColor: 'rgba(185,28,28,0.20)',
  },
  roundBtnDisabled: { opacity: 0.55 },

  // ✅ modal (white sheet)
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    padding: 16,

    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
  },
  modalHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.18)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: '#0F172A',
    fontSize: 16.5,
    fontWeight: '700',
  },
  modalSub: {
    marginTop: 6,
    color: 'rgba(15,23,42,0.60)',
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: '500',
  },
  optionsWrap: { marginTop: 12 },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(248,250,252,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    marginBottom: 10,
  },
  optionRowChecked: {
    borderColor: 'rgba(2, 132, 199, 0.22)',
    backgroundColor: 'rgba(2,132,199,0.08)',
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: 'rgba(2,132,199,0.14)',
    borderColor: 'rgba(2,132,199,0.25)',
  },
  optionText: {
    color: 'rgba(15,23,42,0.85)',
    fontSize: 14,
    fontWeight: '600',
  },

  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 6,
    paddingTop: 6,
  },
  actionBtn: {
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
  },
  actionBtnGhost: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(15,23,42,0.10)',
  },
  actionBtnPrimary: {
    backgroundColor: '#0F172A',
    borderColor: 'rgba(15,23,42,0.10)',
  },
  actionTextGhost: {
    color: 'rgba(15,23,42,0.55)',
    fontSize: 13.5,
    fontWeight: '600',
  },
  actionTextPrimary: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
  },
});
