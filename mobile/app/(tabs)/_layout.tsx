import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React from 'react';

// Renkleri sohbet ekranıyla uyumlu hale getirebiliriz (isteğe bağlı)
const DarkThemeColors = {
  background: '#0b1220',
  active: '#10b981',
  inactive: '#9CA3AF',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,

        // --- İSTEĞE BAĞLI: Görünümü iyileştirmek için ---
        tabBarActiveTintColor: DarkThemeColors.active,
        tabBarInactiveTintColor: DarkThemeColors.inactive,
        tabBarStyle: {
          backgroundColor: DarkThemeColors.background,
          borderTopColor: '#1f2937', // Üst çizgi rengi
        }
        // --- Bitiş ---
      }}>
      <Tabs.Screen
        name="index" // app/(tabs)/index.tsx dosyasını hedefler
        options={{
          title: "Home",
          tabBarIcon: ({ size, color }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore" // app/(tabs)/explore.tsx dosyasını hedefler
        options={{
          title: "Explore",
          tabBarIcon: ({ size, color }) => <Ionicons name="compass-outline" size={size} color={color} />,
        }}
      />
      {/* Yeni eklediğimiz sohbet sekmesi */}
      <Tabs.Screen
        name="chat" // app/(tabs)/chat.tsx dosyasını hedefler
        options={{
          title: "Chat",
          tabBarIcon: ({ size, color }) => <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}