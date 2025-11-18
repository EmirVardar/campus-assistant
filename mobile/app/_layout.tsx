import { useEffect } from 'react';
// DÜZELTME 1: Stack'i expo-router'dan import et
import { router, Stack, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ActivityIndicator, View } from 'react-native';

function RootLayoutNav() {
  const { token, isLoading } = useAuth();
  const segments = useSegments();

  // Yönlendirme mantığı (DOKUNULMADI - ZATEN DOĞRU)
  useEffect(() => {
    if (isLoading) return;
    const inAppGroup = segments[0] === '(tabs)';
    const onLoginPage = segments[0] === 'login';

    if (token && !inAppGroup) {
      router.replace('/(tabs)/chat');
    } else if (!token && inAppGroup) {
      router.replace('/login');
    } else if (!token && !onLoginPage) {
      router.replace('/login');
    }
  }, [token, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#111827' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // DÜZELTME 2: <Slot /> yerine <Stack /> döndür
  // Bu, artık hem 'login' hem de '(tabs)' için bir "iskelet" sağlar.
  // Bu sayede 'chat.tsx' ve 'login.tsx' içindeki <Stack.Screen>
  // konfigürasyonları (başlıkları gizleme/gösterme) ÇALIŞACAKTIR.
  return (
    <Stack>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}