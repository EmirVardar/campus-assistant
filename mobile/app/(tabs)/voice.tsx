import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Text,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { useAuth } from '../../context/AuthContext';

const API_BASE = process.env.EXPO_PUBLIC_API_URL;

type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';

const BARS = 24;
const FRAME_MS = 50;

/* ================= HELPERS ================= */

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function createBars() {
  return Array.from({ length: BARS }, () => new Animated.Value(0.1));
}

/* --- GERÇEKÇİ / GÜÇLÜ DALGA --- */
function animateBars(bars: Animated.Value[], level: number) {
  const mid = (bars.length - 1) / 2;

  const boosted = clamp01(level * 1.6);
  const perceived = Math.pow(boosted, 0.55);

  Animated.parallel(
    bars.map((v, i) => {
      const dist = Math.abs(i - mid) / mid;
      const shape = Math.cos(dist * Math.PI * 0.5);

      const target =
        0.08 + perceived * 1.25 * Math.pow(shape, 1.3);

      return Animated.timing(v, {
        toValue: target,
        duration: FRAME_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      });
    })
  ).start();
}

/* ---------- PROSODY ---------- */

function estimateTtsDurationMs(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(800, Math.min(20000, words * 220));
}

function buildProsodyEnvelope(
  text: string,
  durationMs: number,
  frameMs: number
) {
  const frames = Math.max(1, Math.floor(durationMs / frameMs));
  const tokens = text.trim().split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return Array(frames).fill(0.15);
  }

  const framesPerToken = Math.max(1, Math.floor(frames / tokens.length));
  const out: number[] = [];
  let phase = 0;

  for (const token of tokens) {
    let energy = 0.35;

    if (token.length > 7) energy += 0.12;
    if (/[!?]/.test(token)) energy += 0.25;
    if (/[.,;]/.test(token)) energy -= 0.12;

    energy = clamp01(energy);

    for (let i = 0; i < framesPerToken; i++) {
      const wobble = Math.sin(phase) * 0.12;
      phase += 0.6;
      out.push(clamp01(energy + wobble));
      if (out.length >= frames) break;
    }
    if (out.length >= frames) break;
  }

  while (out.length < frames) {
    out.push(out[out.length - 1]);
  }

  return out;
}

/* ================= COMPONENT ================= */

export default function VoiceTab() {
  const { token } = useAuth();

  const [phase, setPhase] = useState<Phase>('idle');
  const [recording, setRecording] = useState<Audio.Recording | null>(null);

  const bars = useRef(createBars()).current;
  const soundRef = useRef<Audio.Sound | null>(null);
  const timerRef = useRef<NodeJS.Timer | null>(null);

  const envelopeRef = useRef<number[]>([]);
  const frameIndexRef = useRef(0);

  /* ---------- RECORD ---------- */
  const startRecording = async () => {
    if (!token) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const rec = new Audio.Recording();
    await rec.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      meteringEnabled: true,
    });

    rec.setOnRecordingStatusUpdate((s: any) => {
      if (typeof s.metering === 'number') {
        const lvl = clamp01((s.metering + 60) / 60);
        animateBars(bars, lvl);
      }
    });

    await rec.startAsync();
    setRecording(rec);
    setPhase('listening');
  };

  const stopRecording = async () => {
    if (!recording) return;

    setPhase('thinking');
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecording(null);

    if (uri) sendVoice(uri);
  };

  /* ---------- BACKEND ---------- */
  const sendVoice = async (uri: string) => {
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
    } = await res.json();

    if (data.audioBase64) {
      playAudio(data.audioBase64, data.ttsText ?? '');
    }
  };

  /* ---------- PLAYBACK ---------- */
  const playAudio = async (base64: string, ttsText: string) => {
    setPhase('speaking');

    // 🔊 HOPARLÖR (ChatTab ile aynı, STABLE)
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      playThroughEarpieceAndroid: false,
      staysActiveInBackground: false,
    });

    const uri = FileSystem.documentDirectory + 'answer.mp3';
    await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' });

    // önce tahmini envelope
    const estimatedMs = estimateTtsDurationMs(ttsText);
    envelopeRef.current = buildProsodyEnvelope(
      ttsText,
      estimatedMs,
      FRAME_MS
    );
    frameIndexRef.current = 0;

    const { sound } = await Audio.Sound.createAsync({ uri });
    soundRef.current = sound;

    timerRef.current = setInterval(() => {
      const env = envelopeRef.current;
      const i = frameIndexRef.current;
      const lvl = env[Math.min(i, env.length - 1)] ?? 0.15;
      animateBars(bars, lvl);
      frameIndexRef.current = i + 1;
    }, FRAME_MS);

    sound.setOnPlaybackStatusUpdate((s: any) => {
      if (s.isLoaded && typeof s.durationMillis === 'number') {
        envelopeRef.current = buildProsodyEnvelope(
          ttsText,
          s.durationMillis,
          FRAME_MS
        );
      }
      if (s.didJustFinish) cleanup();
    });

    await sound.playAsync();
  };

  const cleanup = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    bars.forEach(v => v.setValue(0.1));
    setPhase('idle');

    soundRef.current?.unloadAsync();
    soundRef.current = null;
  };

  /* ---------- UI ---------- */
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.wave}>
          {bars.map((v, i) => (
            <Animated.View
              key={i}
              style={[styles.bar, { transform: [{ scaleY: v }] }]}
            />
          ))}
        </View>

        <TouchableOpacity
          style={styles.mic}
          onPressIn={startRecording}
          onPressOut={stopRecording}
          disabled={phase === 'thinking' || phase === 'speaking'}
        >
          <Ionicons name="mic" size={28} color="#0B1220" />
        </TouchableOpacity>

        <Text style={styles.phase}>{phase}</Text>
      </View>
    </SafeAreaView>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#05070D' },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wave: {
    flexDirection: 'row',
    height: 44,
    gap: 4,
    marginBottom: 40,
  },
  bar: {
    width: 6,
    height: 34,
    backgroundColor: '#7DD3FC',
    borderRadius: 4,
  },
  mic: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#7DD3FC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  phase: {
    marginTop: 14,
    color: '#94A3B8',
    fontSize: 12,
  },
});
