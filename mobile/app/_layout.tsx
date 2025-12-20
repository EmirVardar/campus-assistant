// app/_layout.tsx
import { Stack } from 'expo-router';
import { AuthProvider } from '../context/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'fade',            // genel geçiş daha “premium” durur
          contentStyle: { backgroundColor: '#070B14' }, // koyu tema standardı
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />

        {/* ✅ modal ekranını gerçek modal gibi sun */}
        <Stack.Screen
          name="modal"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom', // modal hissi
          }}
        />
      </Stack>
    </AuthProvider>
  );
}
