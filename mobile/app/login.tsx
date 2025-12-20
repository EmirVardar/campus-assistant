// app/login.tsx
import React, { useMemo, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  Pressable,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

const API_BASE = process.env.EXPO_PUBLIC_API_URL;

export default function Login() {
  const [email, setEmail] = useState('test@sau.edu.tr');
  const [password, setPassword] = useState('12345');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { signIn } = useAuth();

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && password.trim().length > 0 && !loading;
  }, [email, password, loading]);

  const handleLogin = async () => {
    if (!canSubmit) return;

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
      if (!token) {
        throw new Error('Sunucudan token alınamadı');
      }

      await signIn(token);

      // ✅ Başarılı login -> chat'e geç (geri tuşu ile login'e dönmesin)
      router.replace('/(tabs)/chat');
    } catch (e: any) {
      setError(e.message || 'Bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ title: 'Giriş Yap', headerShown: false }} />

      {/* Arka plan “glow” katmanları */}
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.logo}>
            <Ionicons name="school-outline" size={22} color="#D1FAE5" />
          </View>
          <Text style={styles.title}>Kampüs Asistanı</Text>
          <Text style={styles.subtitle}>
            SAÜ öğrencileri için hızlı bilgi ve destek.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hesabına giriş yap</Text>

          {/* Email */}
          <View style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}>
            <Ionicons
              name="mail-outline"
              size={18}
              color={emailFocused ? '#34D399' : '#9CA3AF'}
              style={styles.leftIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#9CA3AF"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              returnKeyType="next"
            />
          </View>

          {/* Password */}
          <View style={[styles.inputWrap, passwordFocused && styles.inputWrapFocused]}>
            <Ionicons
              name="lock-closed-outline"
              size={18}
              color={passwordFocused ? '#34D399' : '#9CA3AF'}
              style={styles.leftIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Şifre"
              placeholderTextColor="#9CA3AF"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              hitSlop={10}
              style={styles.rightIconBtn}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={18}
                color="#9CA3AF"
              />
            </Pressable>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#FCA5A5" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Button */}
          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#0B1220" />
            ) : (
              <>
                <Text style={styles.buttonText}>Giriş Yap</Text>
                <Ionicons name="arrow-forward-outline" size={18} color="#0B1220" />
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>Güvenli oturum</Text>
            <View style={styles.divider} />
          </View>

          <Text style={styles.footerHint}>
            Giriş yaparak kullanım şartlarını kabul etmiş olursun.
          </Text>
        </View>

        <Text style={styles.bottomNote}>
          © {new Date().getFullYear()} Campus Assistant
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070B14' },

  bg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070B14',
  },
  glowTop: {
    position: 'absolute',
    top: -140,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(16,185,129,0.22)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -170,
    right: -140,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: 'rgba(59,130,246,0.18)',
  },

  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },

  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(16,185,129,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13.5,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
  },

  card: {
    backgroundColor: 'rgba(17,24,39,0.78)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
    padding: 18,

    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },

  cardTitle: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 14,
  },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2,6,23,0.55)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.16)',
    marginBottom: 12,
    height: 52,
  },
  inputWrapFocused: {
    borderColor: 'rgba(52,211,153,0.55)',
    backgroundColor: 'rgba(2,6,23,0.72)',
  },
  leftIcon: {
    paddingHorizontal: 14,
  },
  input: {
    flex: 1,
    height: 52,
    color: '#FFFFFF',
    fontSize: 15.5,
    paddingRight: 10,
  },
  rightIconBtn: {
    paddingHorizontal: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },

  errorBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(248,113,113,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.28)',
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    color: '#FCA5A5',
    fontSize: 13,
    lineHeight: 16,
  },

  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#34D399',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,

    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#0B1220',
    fontWeight: '900',
    fontSize: 15.5,
    letterSpacing: 0.2,
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.14)',
  },
  dividerText: {
    color: '#94A3B8',
    fontSize: 12,
  },

  footerHint: {
    marginTop: 10,
    color: '#94A3B8',
    fontSize: 12.5,
    lineHeight: 16,
    textAlign: 'center',
  },

  bottomNote: {
    marginTop: 14,
    textAlign: 'center',
    color: 'rgba(148,163,184,0.65)',
    fontSize: 12,
  },
});
