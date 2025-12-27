// app/(tabs)/_layout.tsx
import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const DarkThemeColors = {
  background: '#0b1220',
  active: '#10b981',
  inactive: '#9CA3AF',
};

export default function TabsLayout() {
  const { token, isLoading } = useAuth();

  // Token restore ediliyorsa bekle (UI istersen loader koy)
  if (isLoading) return null;

  // ✅ Token yoksa tabs'a izin verme
  if (!token) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: DarkThemeColors.active,
        tabBarInactiveTintColor: DarkThemeColors.inactive,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarItemStyle: { paddingVertical: 6 },
        tabBarStyle: {
          backgroundColor: DarkThemeColors.background,
          borderTopColor: '#1f2937',
          height: 62,
          paddingBottom: 8,
        },
      }}
    >

      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="chatbubble-ellipses-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="voice"
        options={{
          title: 'Voice',
          tabBarIcon: ({ size, color }) => (
            <Ionicons name="mic-outline" size={size} color={color} />
          ),
        }}
      />

    </Tabs>

  );
}
