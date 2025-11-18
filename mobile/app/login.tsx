import React, { useState } from 'react';
import {
  View, TextInput, StyleSheet, SafeAreaView,
  Text, ActivityIndicator, TouchableOpacity
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_BASE = process.env.EXPO_PUBLIC_API_URL;

export default function Login() {
  const [email, setEmail] = useState('test@sau.edu.tr');
  const [password, setPassword] = useState('12345');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { signIn } = useAuth();

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data || 'Kullanıcı adı veya şifre hatalı');
      }
      const token = data.token;
      if (token) {
        await signIn(token);
      } else {
        throw new Error('Sunucudan token alınamadı');
      }
    } catch (e: any) {
      setError(e.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ title: 'Giriş Yap', headerShown: false }} />
      <View style={styles.content}>
        <Text style={styles.title}>Kampüs Asistanı</Text>
        <View style={styles.inputContainer}>
          <Ionicons name="mail-outline" size={20} color="#6B7280" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#6B7280"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>
        <View style={styles.inputContainer}>
          <Ionicons name="lock-closed-outline" size={20} color="#6B7280" style={styles.icon} />
          <TextInput
            style={styles.input}
            placeholder="Şifre"
            placeholderTextColor="#6B7280"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Giriş Yap</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111827', justifyContent: 'center' },
  content: { paddingHorizontal: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: 'white', marginBottom: 30, textAlign: 'center' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', borderRadius: 10, marginBottom: 15 },
  icon: { paddingHorizontal: 15 },
  input: { flex: 1, height: 50, color: 'white', fontSize: 16 },
  button: { backgroundColor: '#10B981', padding: 15, borderRadius: 10, alignItems: 'center', marginTop: 10 },
  buttonText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  errorText: { color: '#F87171', marginTop: 10, marginBottom: 5, textAlign: 'center', fontSize: 14 },
});