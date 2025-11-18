import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import React from 'react';

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
        tabBarActiveTintColor: DarkThemeColors.active,
        tabBarInactiveTintColor: DarkThemeColors.inactive,
        tabBarStyle: {
          backgroundColor: DarkThemeColors.background,
          borderTopColor: '#1f2937',
        }
      }}>
      <Tabs.Screen
        name="index" // app/(tabs)/index.tsx
        options={{
          title: "Home",
          tabBarIcon: ({ size, color }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      {/* DÜZELTME: 'explore' SEKMESİ SİLİNDİ
        Çünkü o artık 'login' sayfası oldu ve tab bar'da olamaz.
      */}
      <Tabs.Screen
        name="chat" // app/(tabs)/chat.tsx
        options={{
          title: "Chat",
          tabBarIcon: ({ size, color }) => <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}