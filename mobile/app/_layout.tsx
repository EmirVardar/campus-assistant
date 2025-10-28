import { Stack } from 'expo-router';
import React from 'react';

export default function RootLayout() {
  return (
    <Stack>
      {/* Ana tab bar'ımızı (tabs) göstermesini söylüyoruz */}
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

      {/* Modal ekranını alttan açılacak şekilde (presentation: 'modal') ayarlıyoruz */}
      <Stack.Screen
        name="modal"
        options={{
          presentation: 'modal',
          title: 'Modal Ekran' // Başlığını da ayarlayabiliriz
        }}
      />
    </Stack>
  );
}