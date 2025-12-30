import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

export default function ModalScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Modal</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.9}>
          <View style={styles.closeBtn}>
            <Ionicons name="close-outline" size={20} color="#0F172A" />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bu bir modal ekran</Text>
        <Text style={styles.cardText}>
          Burayı profil, ayarlar, “feedback detayları” gibi içerikler için kullanabilirsin.
        </Text>

        <TouchableOpacity onPress={() => router.back()} style={styles.primaryBtn} activeOpacity={0.9}>
          <Text style={styles.primaryText}>Kapat</Text>
          <Ionicons name="arrow-forward-outline" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC', padding: 16 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  title: { color: '#0F172A', fontSize: 18, fontWeight: '900' },

  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  card: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    padding: 16,

    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  cardTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  cardText: { marginTop: 8, color: 'rgba(15,23,42,0.55)', fontSize: 12.5, lineHeight: 16 },

  primaryBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900' },
});
