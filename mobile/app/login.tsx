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
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data || 'Kullanıcı adı veya şifre hatalı');
      }

      const token = data.token;
      if (!token) throw new Error('Sunucudan token alınamadı');

      await signIn(token);
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

      {/* White background + very subtle glow */}
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
            <Ionicons name="school-outline" size={22} color="#0F172A" />
          </View>
          <Text style={styles.title}>Kampüs Asistanı</Text>
          <Text style={styles.subtitle}>SAÜ öğrencileri için hızlı bilgi ve destek.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hesabına giriş yap</Text>

          {/* Email */}
          <View style={[styles.inputWrap, emailFocused && styles.inputWrapFocused]}>
            <Ionicons
              name="mail-outline"
              size={18}
              color={emailFocused ? '#0F172A' : 'rgba(15,23,42,0.45)'}
              style={styles.leftIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(15,23,42,0.35)"
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
              color={passwordFocused ? '#0F172A' : 'rgba(15,23,42,0.45)'}
              style={styles.leftIcon}
            />
            <TextInput
              style={styles.input}
              placeholder="Şifre"
              placeholderTextColor="rgba(15,23,42,0.35)"
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
                color="rgba(15,23,42,0.45)"
              />
            </Pressable>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color="#B91C1C" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Button */}
          <TouchableOpacity
            style={[styles.button, !canSubmit && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={!canSubmit}
            activeOpacity={0.9}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.buttonText}>Giriş Yap</Text>
                <Ionicons name="arrow-forward-outline" size={18} color="#FFFFFF" />
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>Güvenli oturum</Text>
            <View style={styles.divider} />
          </View>

          <Text style={styles.footerHint}>Giriş yaparak kullanım şartlarını kabul etmiş olursun.</Text>
        </View>

        <Text style={styles.bottomNote}>© {new Date().getFullYear()} Campus Assistant</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ✅ Apple-like white canvas
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#F8FAFC' },

  // ✅ ultra subtle glows (keep the feel, but not “neon”)
  glowTop: {
    position: 'absolute',
    top: -140,
    left: -120,
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.12)', // sky
  },
  glowBottom: {
    position: 'absolute',
    bottom: -170,
    right: -140,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.10)', // green
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

  // ✅ minimal logo chip
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,

    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },

  // ✅ lighter typography (less bold)
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13.5,
    color: 'rgba(15,23,42,0.60)',
    textAlign: 'center',
    lineHeight: 18,
  },

  // ✅ white card, soft border, very light shadow
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    padding: 18,

    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 4,
  },

  cardTitle: {
    color: 'rgba(15,23,42,0.75)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 14,
  },

  // ✅ input: white surface + subtle focus ring
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    marginBottom: 12,
    height: 52,
  },
  inputWrapFocused: {
    borderColor: 'rgba(2, 132, 199, 0.35)', // calm blue focus
    shadowColor: '#0284C7',
    shadowOpacity: 0.10,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  leftIcon: { paddingHorizontal: 14 },

  input: {
    flex: 1,
    height: 52,
    color: '#0F172A',
    fontSize: 15.5,
    paddingRight: 10,
    fontWeight: '500',
  },

  rightIconBtn: {
    paddingHorizontal: 14,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ✅ calmer error (not too harsh)
  errorBox: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(185, 28, 28, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.14)',
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    color: 'rgba(185, 28, 28, 0.90)',
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
  },

  // ✅ primary button: Apple-like dark
  button: {
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 2,

    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
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
    backgroundColor: 'rgba(15, 23, 42, 0.10)',
  },
  dividerText: {
    color: 'rgba(15,23,42,0.45)',
    fontSize: 12,
    fontWeight: '500',
  },

  footerHint: {
    marginTop: 10,
    color: 'rgba(15,23,42,0.55)',
    fontSize: 12.5,
    lineHeight: 16,
    textAlign: 'center',
    fontWeight: '500',
  },

  bottomNote: {
    marginTop: 14,
    textAlign: 'center',
    color: 'rgba(15,23,42,0.40)',
    fontSize: 12,
    fontWeight: '500',
  },
});
