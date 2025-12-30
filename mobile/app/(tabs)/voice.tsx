// mobile/app/(tabs)/voice.tsx
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
type Emotion = 'HAPPY' | 'SAD' | 'ANGRY' | 'ANXIOUS' | 'NEUTRAL' | 'UNKNOWN';

const BARS = 34;
const FRAME_MS = 70;

const MIN_SCALE = 0.12;
const MAX_GAIN = 2.05;

const T = {
  bg: '#F8FAFC',
  text: '#0F172A',
  text2: 'rgba(15,23,42,0.70)',
  muted: 'rgba(15,23,42,0.55)',
  border: 'rgba(15,23,42,0.10)',
  borderSoft: 'rgba(15,23,42,0.08)',
  card: '#FFFFFF',
  cardSubtle: 'rgba(248,250,252,0.90)',

  wave: 'rgba(2,132,199,0.92)',
  glow: 'rgba(2,132,199,0.14)',

  ok: 'rgba(22,163,74,0.90)',
  warn: 'rgba(245,158,11,0.92)',
  idle: 'rgba(15,23,42,0.25)',
};

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}
function easeLevel(x: number) {
  const y = clamp01(x);
  return Math.pow(y, 0.52);
}

function makeGains(n: number) {
  const mid = (n - 1) / 2;
  const centerBias = 0.80;
  const edgeFloor = 0.18;

  return Array.from({ length: n }, (_, i) => {
    const dist = Math.abs(i - mid) / mid;
    const gaussian = Math.exp(-Math.pow(dist / 0.52, 2));
    const shaped = edgeFloor + (1 - edgeFloor) * gaussian;
    const rand = 0.96 + Math.random() * 0.08;
    const g = (1 - centerBias) * 1.0 + centerBias * shaped;
    return clamp01(g * rand);
  });
}

function colorsForEmotion(e: Emotion) {
  switch (e) {
    case 'HAPPY':
      return { wave: 'rgba(22,163,74,0.92)', glow: 'rgba(22,163,74,0.14)' };
    case 'SAD':
      return { wave: 'rgba(37,99,235,0.92)', glow: 'rgba(37,99,235,0.14)' };
    case 'ANGRY':
      return { wave: 'rgba(220,38,38,0.92)', glow: 'rgba(220,38,38,0.14)' };
    case 'ANXIOUS':
      return { wave: 'rgba(245,158,11,0.92)', glow: 'rgba(245,158,11,0.14)' };
    case 'UNKNOWN':
      return { wave: 'rgba(15,23,42,0.30)', glow: 'rgba(15,23,42,0.08)' };
    case 'NEUTRAL':
    default:
      return { wave: T.wave, glow: T.glow };
  }
}

// “Yavaş & ince” travelling-wave için daha yumuşak keyframe üretimi
function buildTravelKeyframes(
  bars: number,
  samples: number,
  opts: { sigma?: number; freq?: number; floor?: number }
) {
  const sigma = opts.sigma ?? 0.28;  // ↑ daha geniş tepe (atım hissi azalır)
  const freq = opts.freq ?? 0.85;    // ↓ daha yumuşak dalga
  const floor = opts.floor ?? 0.04;  // ↓ taban

  const inputRange = Array.from({ length: samples }, (_, k) => k / (samples - 1));
  const perBarOutputs: number[][] = Array.from({ length: bars }, () => []);

  for (let i = 0; i < bars; i++) {
    const pos = bars === 1 ? 0 : i / (bars - 1);
    for (let k = 0; k < samples; k++) {
      const t = inputRange[k];

      let d = pos - t;
      d = ((d + 1.5) % 1) - 0.5;

      const env = Math.exp(-Math.pow(d / sigma, 2)); // geniş env
      const phase = 2 * Math.PI * (freq * (pos - t));
      const carrier = 0.5 + 0.5 * Math.sin(phase);

      // env baskın, carrier hafif (atım değil akış)
      const shape = clamp01(floor + 0.75 * env * (0.55 + 0.45 * carrier));
      perBarOutputs[i].push(shape);
    }
  }

  return { inputRange, perBarOutputs };
}

export default function VoiceTab() {
  const { token } = useAuth();

  const [phase, setPhase] = useState<Phase>('idle');
  const [emotion, setEmotion] = useState<Emotion>('NEUTRAL');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);

  const levelAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  const travelT = useRef(new Animated.Value(0)).current;
  const travelLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // 0 => travel, 1 => mouth
  const mouthAmount = useRef(new Animated.Value(0)).current;

  const gains = useRef(makeGains(BARS)).current;
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

  const emotionLabel = useMemo(() => {
    switch (emotion) {
      case 'HAPPY':
        return 'Mutlu';
      case 'SAD':
        return 'Üzgün';
      case 'ANGRY':
        return 'Kızgın';
      case 'ANXIOUS':
        return 'Kaygılı';
      case 'NEUTRAL':
        return 'Nötr';
      case 'UNKNOWN':
      default:
        return 'Bilinmiyor';
    }
  }, [emotion]);

  const emo = useMemo(() => colorsForEmotion(emotion), [emotion]);

  const animateLevel = (lvl: number) => {
    const target = easeLevel(lvl);

    Animated.timing(levelAnim, {
      toValue: target,
      duration: FRAME_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.timing(glowAnim, {
      toValue: Math.min(1, target * 1.05),
      duration: FRAME_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const resetWave = () => {
    levelAnim.setValue(0);
    glowAnim.setValue(0);
  };

  const startTravelLoop = () => {
    if (travelLoopRef.current) return;
    travelLoopRef.current = Animated.loop(
      Animated.timing(travelT, {
        toValue: 1,
        duration: 3400, // ✅ daha yavaş
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    travelLoopRef.current.start();
  };

  const stopTravelLoop = () => {
    try {
      travelLoopRef.current?.stop();
    } catch {}
    travelLoopRef.current = null;
    try {
      travelT.stopAnimation();
    } catch {}
    travelT.setValue(0);
  };

  const travelEnabled = phase === 'idle' || phase === 'thinking';
  useEffect(() => {
    if (travelEnabled) startTravelLoop();
    else stopTravelLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travelEnabled]);

  useEffect(() => {
    const target = phase === 'listening' || phase === 'speaking' ? 1 : 0;
    Animated.timing(mouthAmount, {
      toValue: target,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [phase, mouthAmount]);

  useEffect(() => {
    isMountedRef.current = true;

    const subLevel = NativeAudioEmitter.addListener('onLevel', (p: any) => {
      if (!isPressedRef.current) return;
      if (p && typeof p.level === 'number') animateLevel(clamp01(p.level));
    });

    const subErr = NativeAudioEmitter.addListener('onError', (p: any) => {
      console.log('[NativeAudio:onError]', p);
    });

    return () => {
      isMountedRef.current = false;
      subLevel.remove();
      subErr.remove();
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        stopAllNow();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAllNow = async () => {
    try {
      await soundRef.current?.stopAsync();
      await soundRef.current?.unloadAsync();
    } catch {}
    soundRef.current = null;

    try {
      await recording?.stopAndUnloadAsync();
    } catch {}
    setRecording(null);

    try {
      NativeAudio.stop?.();
    } catch {}

    resetWave();
    setPhase('idle');
  };

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
    if (disabled) return;
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
      await rec.prepareToRecordAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY });
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

      if (uri) await sendVoice(uri);
      else setPhase('idle');
    } catch (e: any) {
      console.log('[voice] stopRecording error', e);
      await stopAllNow();
    }
  };

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

      const data: {
        audioBase64?: string;
        ttsText?: string;
        emotion?: Emotion;
        answer?: string;
      } = await res.json();

      setEmotion(data.emotion ?? 'NEUTRAL');

      if (data.audioBase64) await playAudio(data.audioBase64);
      else setPhase('idle');
    } catch (e: any) {
      console.log('[voice] sendVoice error', e);
      setPhase('idle');
    }
  };

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
      const clean = base64.replace(/\s/g, '');
      await FileSystem.writeAsStringAsync(uri, clean, { encoding: 'base64' });

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

  // ---- shapes ----
  const { inputRange, perBarOutputs } = useMemo(() => {
    return buildTravelKeyframes(BARS, 25, { sigma: 0.28, freq: 0.85, floor: 0.04 });
  }, []);

  // Konuşma enerjisi: daha yumuşak + tavan
  const energyRaw = useMemo(() => {
    return levelAnim.interpolate({
      inputRange: [0, 0.20, 0.45, 0.75, 1],
      outputRange: [0, 0.08, 0.42, 0.78, 1],
      extrapolate: 'clamp',
    });
  }, [levelAnim]);

  // ✅ taşmayı engelle: max 0.78
  const energyClamped = useMemo(() => {
    return Animated.diffClamp(energyRaw as any, 0, 0.78) as any;
  }, [energyRaw]);

  const mouthWeightForIndex = useMemo(() => {
    const mid = (BARS - 1) / 2;
    return Array.from({ length: BARS }, (_, i) => {
      const dist = Math.abs(i - mid) / mid;
      const w = Math.exp(-Math.pow(dist / 0.42, 2));
      return clamp01(0.20 + 0.80 * w);
    });
  }, []);

  const barViews = useMemo(() => {
    const idleAmp = 0.04;      // ✅ daha ince
    const travelBoost = 0.20;  // ✅ daha sakin (atım değil)
    const mouthBase = 0.10;
    const mouthBoost = 1.50;   // ✅ konuşma genliği düşürüldü

    const oneMinusMouth = Animated.subtract(1, mouthAmount);

    return gains.map((g, i) => {
      const travelShape = travelT.interpolate({
        inputRange,
        outputRange: perBarOutputs[i],
        extrapolate: 'clamp',
      });

      const travelCombined = Animated.multiply(
        travelShape,
        Animated.add(idleAmp, Animated.multiply(travelBoost, travelShape))
      );

      const mouthCombined = Animated.multiply(
        Animated.add(mouthBase, Animated.multiply(mouthBoost, energyClamped)),
        mouthWeightForIndex[i]
      );

      const blended = Animated.add(
        Animated.multiply(travelCombined, oneMinusMouth),
        Animated.multiply(mouthCombined, mouthAmount)
      );

      // ✅ scaleY üst tavan: inputRange’ı daraltıp taşmayı azaltıyoruz
      const scaleY = blended.interpolate({
        inputRange: [0, 1.15],
        outputRange: [MIN_SCALE + 0.01, MIN_SCALE + 0.01 + (MAX_GAIN * 1.10) * g],
        extrapolate: 'clamp',
      });

      const wobbleX = blended.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.015],
        extrapolate: 'clamp',
      });

      const baseOpacity = 0.66 + 0.34 * g;
      const width = 3 + (g > 0.88 ? 1 : 0);

      return (
        <Animated.View
          key={i}
          style={[
            styles.bar,
            {
              width,
              opacity: baseOpacity,
              backgroundColor: emo.wave,
              transform: [{ scaleY }, { scaleX: wobbleX }],
            },
          ]}
        />
      );
    });
  }, [
    gains,
    travelT,
    inputRange,
    perBarOutputs,
    mouthAmount,
    energyClamped,
    mouthWeightForIndex,
    emo.wave,
  ]);

  const glowOpacity = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.05, 0.16],
    extrapolate: 'clamp',
  });

  const glowScale = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
    extrapolate: 'clamp',
  });

  const dotStyle =
    phase === 'speaking'
      ? { backgroundColor: emo.wave }
      : phase === 'listening'
      ? styles.dotOn
      : phase === 'thinking'
      ? styles.dotThink
      : styles.dotIdle;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </View>

      <View style={styles.container}>
        <View style={styles.headerCard}>
          <View style={styles.headerLeft}>
            <View style={styles.iconChip}>
              <Ionicons name="mic-outline" size={16} color={T.text2} />
            </View>

            <View style={styles.headerTextWrap}>
              <Text style={styles.title} numberOfLines={1}>
                Sesli Asistan
              </Text>
              <Text style={styles.subtitle} numberOfLines={2}>
                Basılı tutarak konuş, bırakınca gönderilir.
              </Text>
            </View>
          </View>

          <View style={styles.badge}>
            <View style={[styles.dot, dotStyle]} />
            <Text style={styles.badgeText}>{phaseLabel}</Text>
          </View>
        </View>

        <View style={styles.waveCard}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.waveGlow,
              {
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
                backgroundColor: emo.glow,
              },
            ]}
          />
          <View style={styles.waveRow}>{barViews}</View>

          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="sparkles-outline" size={14} color={T.text2} />
              <Text style={styles.metaText}>
                {phase === 'thinking'
                  ? 'Yanıt hazırlanıyor'
                  : phase === 'speaking'
                  ? 'Ses oynatılıyor'
                  : phase === 'listening'
                  ? 'Dinleniyor'
                  : 'Bekliyor'}
              </Text>
            </View>

            <View style={styles.metaChip}>
              <View style={[styles.emotionDot, { backgroundColor: emo.wave }]} />
              <Text style={styles.metaText}>{emotionLabel}</Text>
            </View>
          </View>
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
            styles.ptt,
            disabled && styles.pttDisabled,
            pressed && !disabled && styles.pttPressed,
          ]}
        >
          <View style={styles.pttInner}>
            <Ionicons name="mic" size={22} color="#FFFFFF" />
          </View>
          <Text style={styles.pttText}>{disabled ? 'Bekle' : 'Konuş'}</Text>
        </Pressable>

        <Text style={styles.footerNote}>
          {Platform.OS === 'ios'
            ? 'En akıcı sonuç için Release build üzerinde test et.'
            : 'Cihazda performans genelde daha iyi olur.'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },

  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: T.bg },
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

  container: {
    flex: 1,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },

  headerCard: {
    backgroundColor: T.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    padding: 14,
    marginBottom: 12,

    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,

    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },

  headerTextWrap: {
    flex: 1,
    minWidth: 0,
  },

  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: T.borderSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    color: T.text,
    fontSize: 16.5,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  subtitle: {
    marginTop: 3,
    color: T.muted,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 16,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.borderSoft,
    marginLeft: 10,
    marginTop: 2,
    flexShrink: 0,
  },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: T.idle },
  dotIdle: { backgroundColor: T.idle },
  dotOn: { backgroundColor: T.wave },
  dotThink: { backgroundColor: T.warn },
  badgeText: {
    color: T.text2,
    fontSize: 12,
    fontWeight: '600',
  },

  waveCard: {
    backgroundColor: T.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: T.border,
    paddingVertical: 16,
    paddingHorizontal: 14,

    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,

    overflow: 'hidden',
    marginBottom: 14,
  },

  waveGlow: {
    position: 'absolute',
    left: -44,
    right: -44,
    top: -34,
    bottom: -34,
    borderRadius: 999,
    backgroundColor: T.glow,
  },

  waveRow: {
    height: 86,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginBottom: 12,
  },

  bar: {
    height: 48,
    borderRadius: 999,
    backgroundColor: T.wave,
  },

  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },

  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: T.cardSubtle,
    borderWidth: 1,
    borderColor: T.borderSoft,
  },
  metaText: {
    color: T.text2,
    fontSize: 12,
    fontWeight: '600',
  },

  emotionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  ptt: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
  },

  pttInner: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: T.text,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: T.borderSoft,

    shadowColor: '#000',
    shadowOpacity: 0.10,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },

  pttPressed: { transform: [{ scale: 0.985 }], opacity: 0.98 },
  pttDisabled: { opacity: 0.45 },

  pttText: {
    color: T.text2,
    fontSize: 12.8,
    fontWeight: '700',
    letterSpacing: 0.1,
  },

  footerNote: {
    marginTop: 14,
    textAlign: 'center',
    color: 'rgba(15,23,42,0.45)',
    fontSize: 11.5,
    fontWeight: '600',
  },
});
