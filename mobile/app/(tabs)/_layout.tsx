import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const LightTheme = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  border: 'rgba(15, 23, 42, 0.10)',
  text: '#0F172A',
  active: '#111827', // siyah premium
  inactive: 'rgba(15, 23, 42, 0.45)',
};

export default function TabsLayout() {
  const { token, isLoading } = useAuth();

  if (isLoading) return null;
  if (!token) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: LightTheme.active,
        tabBarInactiveTintColor: LightTheme.inactive,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700' },
        tabBarItemStyle: { paddingVertical: 6 },
        tabBarStyle: {
          backgroundColor: LightTheme.card,
          borderTopColor: LightTheme.border,
          borderTopWidth: 1,
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
