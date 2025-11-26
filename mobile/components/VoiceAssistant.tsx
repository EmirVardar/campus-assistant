import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

export default function VoiceAssistant() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<string>('Sorunuzu sormak için butona basılı tutun...');
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  // .env dosyasındaki URL'i alıp endpoint'i ekliyoruz
  const API_URL = `${process.env.EXPO_PUBLIC_API_URL}/api/voice/ask`;

  async function startRecording() {
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
    } catch (err) {
      Alert.alert("Hata", "Mikrofon başlatılamadı.");
    }
  }

  async function stopRecording() {
    if (!recording) return;
    setRecording(null);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI(); 
    if (uri) sendToBackend(uri);
  }

  async function sendToBackend(uri: string) {
    setLoading(true);
    setAiResponse("Asistan düşünüyor...");
    try {
      const formData = new FormData();
      // @ts-ignore
      formData.append('file', { uri: uri, type: 'audio/m4a', name: 'recording.m4a' });

      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (!response.ok) throw new Error('Sunucu hatası');
      const data = await response.json();
      
      setAiResponse(data.answerText);
      if (data.audioBase64) playResponseAudio(data.audioBase64);

    } catch (error) {
      setAiResponse("Bağlantı hatası.");
    } finally {
      setLoading(false);
    }
  }

  async function playResponseAudio(base64String: string) {
    try {
      const uri = FileSystem.documentDirectory + 'voice_response.mp3';
      await FileSystem.writeAsStringAsync(uri, base64String, { encoding: FileSystem.EncodingType.Base64 });
      const { sound } = await Audio.Sound.createAsync({ uri });
      await sound.playAsync();
    } catch (error) {
      console.error(error);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.responseText}>{aiResponse}</Text>
      <TouchableOpacity
        style={[styles.recordButton, recording ? styles.recording : null]}
        onPressIn={startRecording}
        onPressOut={stopRecording}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{recording ? '...' : '🎙️'}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', padding: 20 },
  responseText: { fontSize: 16, textAlign: 'center', marginBottom: 20, color: '#333' },
  recordButton: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center' },
  recording: { backgroundColor: '#FF3B30', transform: [{ scale: 1.1 }] },
  buttonText: { fontSize: 30 },
});