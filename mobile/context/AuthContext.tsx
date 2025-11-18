import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

interface AuthContextData {
  token: string | null;
  isLoading: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadToken() {
      try {
        const storedToken = await AsyncStorage.getItem('userToken');
        if (storedToken) {
          setToken(storedToken);
        }
      } catch (e) {
        console.error("Hafızadan token yüklenemedi", e);
      } finally {
        setIsLoading(false);
      }
    }
    loadToken();
  }, []);

  const signIn = async (newToken: string) => {
    try {
      setToken(newToken);
      await AsyncStorage.setItem('userToken', newToken);
      // DÜZELTME: Artık (tabs)/chat'e yönlendir
      router.replace('/(tabs)/chat');
    } catch (e) {
      console.error("Token kaydedilemedi", e);
    }
  };

  const signOut = async () => {
    try {
      setToken(null);
      await AsyncStorage.removeItem('userToken');
      // DÜZELTME: Artık /login'e yönlendir
      router.replace('/login');
    } catch (e) {
      console.error("Token silinemedi", e);
    }
  };

  return (
    <AuthContext.Provider value={{ token, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}