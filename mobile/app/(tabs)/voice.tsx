import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Text,
  Pressable,
  Alert,
  Platform,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../../context/AuthContext';

import NativeAudio, { NativeAudioEmitter } from '../../lib/NativeAudio';

const API_BASE = process.env.EXPO_PUBLIC_API_URL;

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

/**
 * ✅ Performans:
 * - 34 bar, tek Animated.Value (levelAnim) -> kasma azalır
 * - FRAME_MS 70ms -> daha stabil
 *
 * ✅ Görsel:
 * - Genlik yüksek (MAX_GAIN)
 * - Kapsül bar (borderRadius 999)
 * - Merkez barlar biraz daha parlak + güçlü barlar 1px daha kalın
 *
 * ✅ Fix (A):
 * - "Ortadan açılıyor" hissini azaltmak için center ağırlığı kırıldı (daha homojen)
 */
const BARS = 34;
const FRAME_MS = 70;

const MIN_SCALE = 0.12; // taban ince
const MAX_GAIN = 1.85;  // genlik yüksek

/* ================= HELPERS ================= */

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

// Daha “punchy” algı
function easeLevel(x: number) {
  const y = clamp01(x);
  return Math.pow(y, 0.52);
}

/**
 * ✅ FIX (A) — Homojenlik:
 * Eski center: cos^1.55  -> kenarları çok öldürüyordu.
 * Yeni center: taban + cos^0.9 -> kenarlar da canlı kalır.
 */
function makeGains(n: number) {
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => {
    const dist = Math.abs(i - mid) / mid;

    // ✅ daha homojen dağılım: merkez yine güçlü ama kenarlar “ölmüyor”
    const center = 0.58 + 0.42 * Math.pow(Math.cos(dist * Math.PI * 0.5), 0.9);

    // sabit küçük rastgelelik: bağımsız hissi (biraz daha kontrollü)
    const rand = 0.90 + Math.random() * 0.28; // 0.90..1.18

    // kenara doğru çok az karakter (daha hafif)
    const edge = 0.96 + dist * 0.06;

    return clamp01(center * rand * edge);
  });
}

function makePhases(n: number) {
  return Array.from({ length: n }, () => Math.random() * Math.PI * 2);
}

/* ================= COMPONENT ================= */

export default function VoiceTab() {
  const { token } = useAuth();

  const [phase, setPhase] = useState<Phase>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);

  // ✅ Tek animasyon değeri
  const levelAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  // ✅ bar karakterleri (sabit)
  const gains = useRef(makeGains(BARS)).current;
  const phases = useRef(makePhases(BARS)).current;

  // ✅ press-to-talk stability refs
  const isPressedRef = useRef(false);
  const startInFlightRef = useRef(false);
  const stopQueuedRef = useRef(false);
  const isMountedRef = useRef(true);

  const disabled = phase === 'thinking' || phase === 'speaking';

  const phaseLabel = useMemo(() => {
    switch (phase) {
      case 'idle':
        return 'Hazır';
      case 'listening':
        return 'Dinliyorum';
      case 'thinking':
        return 'Düşünüyorum';
      case 'speaking':
        return 'Konuşuyorum';
      default:
        return phase;
    }
  }, [phase]);

  const animateLevel = (lvl: number) => {
    const target = easeLevel(lvl);

    Animated.timing(levelAnim, {
      toValue: target,
      duration: FRAME_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.timing(glowAnim, {
      toValue: Math.min(1, target * 1.1),
      duration: FRAME_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const resetWave = () => {
    levelAnim.setValue(0);
    glowAnim.setValue(0);
  };

  /* ---------- NativeAudio: listen for mic level ---------- */
  useEffect(() => {
    isMountedRef.current = true;

    const subLevel = NativeAudioEmitter.addListener('onLevel', (p: any) => {
      if (!isPressedRef.current) return;
      if (p && typeof p.level === 'number') {
        animateLevel(clamp01(p.level));
      }
    });

    const subErr = NativeAudioEmitter.addListener('onError', (p: any) => {
      console.log('[NativeAudio:onError]', p);
    });

    return () => {
      isMountedRef.current = false;
      subLevel.remove();
      subErr.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Cleanup on unmount ---------- */
  useEffect(() => {
    return () => {
      try {
        stopAllNow();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAllNow = async () => {
    // stop audio playback
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch {}
    soundRef.current = null;

    // stop recording
    try {
      await recording?.stopAndUnloadAsync();
    } catch {}
    setRecording(null);

    // stop native meter
    try {
      NativeAudio.stop?.();
    } catch {}

    resetWave();
    setPhase('idle');
  };

  /* ================= PRESS-TO-TALK FLOW ================= */

  const ensureMicPermissionAndStartMeters = async () => {
    const granted = await NativeAudio.requestPermission();
    if (!granted) return false;

    if (NativeAudio.configure) {
      await NativeAudio.configure(FRAME_MS);
    }

    await NativeAudio.start();
    return true;
  };

  const startRecording = async () => {
    if (!token) return;
    if (phase === 'thinking' || phase === 'speaking') return;
    if (startInFlightRef.current) return;
    if (recording) return;

    startInFlightRef.current = true;
    stopQueuedRef.current = false;

    try {
      setPhase('listening');

      const ok = await ensureMicPermissionAndStartMeters();
      if (!ok) {
        setPhase('idle');
        resetWave();
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      });
      await rec.startAsync();

      if (!isMountedRef.current) return;

      setRecording(rec);

      if (stopQueuedRef.current) {
        await stopRecordingInternal(rec);
      }
    } catch (e: any) {
      console.log('[voice] startRecording error', e);
      Alert.alert('Kayıt başlatılamadı', String(e?.message ?? e));
      await stopAllNow();
    } finally {
      startInFlightRef.current = false;
    }
  };

  const stopRecording = async () => {
    if (startInFlightRef.current) {
      stopQueuedRef.current = true;
      return;
    }
    if (!recording) {
      try {
        NativeAudio.stop?.();
      } catch {}
      resetWave();
      if (phase === 'listening') setPhase('idle');
      return;
    }

    await stopRecordingInternal(recording);
  };

  const stopRecordingInternal = async (rec: Audio.Recording) => {
    try {
      setPhase('thinking');

      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();

      setRecording(null);

      try {
        NativeAudio.stop?.();
      } catch {}

      resetWave();

      if (uri) {
        await sendVoice(uri);
      } else {
        setPhase('idle');
      }
    } catch (e: any) {
      console.log('[voice] stopRecording error', e);
      await stopAllNow();
    }
  };

  /* ---------- BACKEND ---------- */
  const sendVoice = async (uri: string) => {
    try {
      const form = new FormData();
      // @ts-ignore
      form.append('file', { uri, type: 'audio/m4a', name: 'voice.m4a' });

      const res = await fetch(`${API_BASE}/api/voice/ask`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      const data: { audioBase64?: string; ttsText?: string } = await res.json();

      if (data.audioBase64) {
        await playAudio(data.audioBase64);
      } else {
        setPhase('idle');
      }
    } catch (e: any) {
      console.log('[voice] sendVoice error', e);
      setPhase('idle');
    }
  };

  /* ---------- PLAYBACK (REAL SYNC) ---------- */
  const playAudio = async (base64: string) => {
    try {
      setPhase('speaking');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: false,
      });

      const uri = FileSystem.documentDirectory + 'answer.mp3';
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });

      // Native tarafta MP3 analizi (FRAME_MS)
      const levels = await NativeAudio.analyzeFile(uri, FRAME_MS);

      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;

      await sound.setProgressUpdateIntervalAsync(FRAME_MS);

      sound.setOnPlaybackStatusUpdate((s: any) => {
        if (!s?.isLoaded) return;

        const pos = typeof s.positionMillis === 'number' ? s.positionMillis : 0;
        const idx = Math.min(levels.length - 1, Math.floor(pos / FRAME_MS));
        const lvl = levels[idx] ?? 0;

        animateLevel(clamp01(lvl));

        if (s.didJustFinish) cleanupPlayback();
      });

      await sound.playAsync();
    } catch (e: any) {
      console.log('[voice] playAudio error', e);
      cleanupPlayback();
    }
  };

  const cleanupPlayback = () => {
    resetWave();
    setPhase('idle');

    soundRef.current?.unloadAsync();
    soundRef.current = null;
  };

  /* ================= UI ================= */

  const barViews = useMemo(() => {
    return gains.map((g, i) => {
      const scaleY = levelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [MIN_SCALE, MIN_SCALE + MAX_GAIN * g],
        extrapolate: 'clamp',
      });

      const wobbleX = levelAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1 + 0.035 * Math.sin(phases[i])],
        extrapolate: 'clamp',
      });

      const baseOpacity = 0.78 + 0.22 * g;
      const width = 3 + (g > 0.55 ? 1 : 0);

      return (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              width,
              opacity: baseOpacity,
              transform: [{ scaleY }, { scaleX: wobbleX }],
            },
          ]}
        />
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gains, phases]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.10, 0.48],
    extrapolate: 'clamp',
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.10],
    extrapolate: 'clamp',
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Sesli Asistan</Text>
          <View style={styles.badge}>
            <View
              style={[
                styles.dot,
                phase === 'listening'
                  ? styles.dotOn
                  : phase === 'speaking'
                  ? styles.dotSpeak
                  : phase === 'thinking'
                  ? styles.dotThink
                  : styles.dotIdle,
              ]}
            />
            <Text style={styles.badgeText}>{phaseLabel}</Text>
          </View>
        </View>

        <View style={styles.waveCard}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glow,
              { opacity: glowOpacity, transform: [{ scale: glowScale }] },
            ]}
          />

          <View style={styles.waveRow}>{barViews}</View>

          <Text style={styles.subHint}>
            Basılı tutarak konuş, bırakınca gönderilir.
          </Text>
        </View>

        <Pressable
          disabled={disabled}
          onPressIn={() => {
            isPressedRef.current = true;
            startRecording();
          }}
          onPressOut={() => {
            isPressedRef.current = false;
            stopRecording();
          }}
          onPressCancel={() => {
            isPressedRef.current = false;
            stopRecording();
          }}
          style={({ pressed }) => [
            styles.micWrap,
            disabled && styles.micDisabled,
            pressed && !disabled && styles.micPressed,
          ]}
        >
          <View style={styles.micInner}>
            <Ionicons name="mic" size={28} color="#081018" />
          </View>
          <Text style={styles.micText}>{disabled ? 'Bekle' : 'Konuş'}</Text>
        </Pressable>

        <Text style={styles.footerNote}>
          {Platform.OS === 'ios'
            ? 'iOS: daha akıcı için Release build test et.'
            : 'Android: dalga performansı cihazda daha iyi olur.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070A12' },
  container: {
    flex: 1,
    paddingHorizontal: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  header: {
    width: '100%',
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#475569',
  },
  dotIdle: { backgroundColor: '#64748B' },
  dotOn: { backgroundColor: '#38BDF8' },
  dotSpeak: { backgroundColor: '#22C55E' },
  dotThink: { backgroundColor: '#FBBF24' },
  badgeText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },

  waveCard: {
    width: '100%',
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15,23,42,0.62)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
    overflow: 'hidden',
    marginBottom: 18,

    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  glow: {
    position: 'absolute',
    left: -40,
    right: -40,
    top: -30,
    bottom: -30,
    borderRadius: 999,
    backgroundColor: 'rgba(125, 211, 252, 0.26)',
  },

  waveRow: {
    height: 78,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginBottom: 10,
  },
  bar: {
    height: 44,
    borderRadius: 999,
    backgroundColor: '#7DD3FC',
  },

  subHint: {
    color: '#94A3B8',
    fontSize: 12,
    textAlign: 'center',
  },

  micWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  micInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#7DD3FC',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7DD3FC',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  micPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.98,
  },
  micDisabled: { opacity: 0.35 },

  micText: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  footerNote: {
    marginTop: 18,
    color: 'rgba(148,163,184,0.65)',
    fontSize: 11,
    textAlign: 'center',
  },
});
