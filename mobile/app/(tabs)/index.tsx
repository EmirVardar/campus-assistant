import { useEffect, useMemo, useState } from 'react';
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Linking,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

const GITHUB_URL = 'https://github.com/EmirVardar/campus-assistant/tree/master';

export default function TabHome() {
  const [msg, setMsg] = useState<string>('loading...');
  const [busy, setBusy] = useState(false);

  const baseUrl = process.env.EXPO_PUBLIC_API_URL || '';
  const { signOut } = useAuth();

  useEffect(() => {
    let mounted = true;
    setBusy(true);

    const url = baseUrl + '/hello';
    fetch(url)
      .then((r) => r.text())
      .then((t) => mounted && setMsg(t))
      .catch(() => mounted && setMsg('api-error'))
      .finally(() => mounted && setBusy(false));

    return () => {
      mounted = false;
    };
  }, [baseUrl]);

  const ok = msg !== 'api-error' && msg !== 'loading...';

  const techGroups = useMemo(
    () => [
      {
        title: 'Mobile',
        icon: 'phone-portrait-outline' as const,
        chips: ['React Native', 'Expo', 'expo-router'],
      },
      {
        title: 'Backend',
        icon: 'server-outline' as const,
        chips: ['Spring Boot', 'Web/WebFlux', 'Security', 'JPA'],
      },
      {
        title: 'RAG',
        icon: 'git-network-outline' as const,
        chips: ['LangChain4j', 'OpenAI', 'Chroma'],
      },
      {
        title: 'Veri & ETL',
        icon: 'swap-horizontal-outline' as const,
        chips: ['PostgreSQL', 'Jsoup', 'Scheduler'],
      },
      {
        title: 'Duygu & Ses',
        icon: 'pulse-outline' as const,
        chips: ['Python (FastAPI) Emotion', 'Native realtime waveform'],
      },
    ],
    []
  );

  const openGithub = async () => {
    try {
      const can = await Linking.canOpenURL(GITHUB_URL);
      if (!can) return Alert.alert('Link açılamadı', 'Cihaz bu URL’i açamıyor.');
      Linking.openURL(GITHUB_URL);
    } catch {
      Alert.alert('Link açılamadı', 'Bir hata oluştu.');
    }
  };

  const copyableApi = baseUrl || '-';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Background glows (Chat temasıyla uyumlu) */}
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="school-outline" size={20} color="#0F172A" />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Campus Assistant</Text>
          <Text style={styles.subtitle}>SAÜ odaklı RAG destekli öğrenci asistanı</Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            Alert.alert('Çıkış', 'Oturumu kapatmak istiyor musun?', [
              { text: 'İptal', style: 'cancel' },
              { text: 'Çıkış Yap', style: 'destructive', onPress: () => signOut() },
            ]);
          }}
          activeOpacity={0.85}
        >
          <View style={styles.iconBtn}>
            <Ionicons name="log-out-outline" size={18} color="rgba(15,23,42,0.75)" />
          </View>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Overview */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.badge}>
              <Ionicons name="sparkles-outline" size={14} color="rgba(15,23,42,0.72)" />
              <Text style={styles.badgeText}>Proje Özeti</Text>
            </View>

            {/* Bağlantı durumu: yeşil/kırmızı yok; nötr chip */}
            <View style={[styles.statusChip, ok ? styles.statusChipOk : styles.statusChipBad]}>
              <Ionicons
                name={ok ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={14}
                color="rgba(15,23,42,0.70)"
              />
              <Text style={styles.statusChipText}>{ok ? 'API bağlı' : 'API yok'}</Text>
              {busy && <ActivityIndicator size="small" color="rgba(15,23,42,0.55)" style={{ marginLeft: 6 }} />}
            </View>
          </View>

          <Text style={styles.paragraph}>
            Duyuru/SSS/ders programı gibi kurumsal kaynakları ETL ile çeker, vektör veritabanına indeksler ve RAG ile
            doğal dilde yanıt üretir. Son etapta Python tabanlı duygu analizi servisi ve mobilde anlık ses dalgası
            entegrasyonu tamamlandı.
          </Text>

          {/* Developers + GitHub (aynı kartta, daha kompakt) */}
          <View style={styles.hr} />

          <View style={styles.twoCol}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Geliştirenler</Text>

              <View style={{ marginTop: 10, gap: 10 }}>
                <View style={styles.personRow}>
                  <Ionicons name="person-circle-outline" size={18} color="#0F172A" />
                  <Text style={styles.personText}>Emir VARDAR</Text>
                </View>
                <View style={styles.personRow}>
                  <Ionicons name="person-circle-outline" size={18} color="#0F172A" />
                  <Text style={styles.personText}>Selenay HUR</Text>
                </View>
              </View>
            </View>

            <View style={styles.vDivider} />

            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>GitHub</Text>

              <TouchableOpacity onPress={openGithub} activeOpacity={0.85} style={{ marginTop: 10 }}>
                <View style={styles.linkBtn}>
                  <Ionicons name="logo-github" size={18} color="#0F172A" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.linkTitle} numberOfLines={1}>
                      EmirVardar/campus-assistant
                    </Text>
                    <Text style={styles.linkSub} numberOfLines={1}>
                      master branch
                    </Text>
                  </View>
                  <Ionicons name="open-outline" size={16} color="rgba(15,23,42,0.55)" />
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* API base (çok küçük, taşmayan satır) */}
          <View style={styles.hrSoft} />
          <View style={styles.kvRow}>
            <Text style={styles.k}>API</Text>
            <Text style={styles.v} numberOfLines={1}>
              {copyableApi}
            </Text>
          </View>
        </View>

        {/* Technologies (kv list yerine: grup + chip) */}
        <View style={[styles.card, { marginTop: 12 }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.badge}>
              <Ionicons name="construct-outline" size={14} color="rgba(15,23,42,0.72)" />
              <Text style={styles.badgeText}>Kullanılan Teknolojiler</Text>
            </View>
          </View>

          <View style={{ marginTop: 12, gap: 12 }}>
            {techGroups.map((g) => (
              <View key={g.title} style={styles.groupBox}>
                <View style={styles.groupHeader}>
                  <Ionicons name={g.icon} size={16} color="rgba(15,23,42,0.75)" />
                  <Text style={styles.groupTitle}>{g.title}</Text>
                </View>

                <View style={styles.chipWrap}>
                  {g.chips.map((c) => (
                    <View key={c} style={styles.chip}>
                      <Text style={styles.chipText}>{c}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFC' },

  // Background
  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: '#F8FAFC' },
  glowTop: {
    position: 'absolute',
    top: -150,
    left: -140,
    width: 340,
    height: 340,
    borderRadius: 999,
    backgroundColor: 'rgba(56, 189, 248, 0.10)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -170,
    right: -150,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },

  content: {
    paddingHorizontal: 16,
    paddingBottom: 18,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  title: { color: '#0F172A', fontSize: 18, fontWeight: '900' },
  subtitle: { color: 'rgba(15,23,42,0.55)', fontSize: 12.5, marginTop: 2 },

  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 3,
  },

  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  badgeText: { color: 'rgba(15,23,42,0.75)', fontSize: 12, fontWeight: '800' },

  // Status chip (no green/red)
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusChipOk: {
    backgroundColor: 'rgba(2,132,199,0.08)',
    borderColor: 'rgba(2,132,199,0.16)',
  },
  statusChipBad: {
    backgroundColor: 'rgba(15,23,42,0.04)',
    borderColor: 'rgba(15,23,42,0.08)',
  },
  statusChipText: { color: 'rgba(15,23,42,0.72)', fontSize: 12, fontWeight: '800' },

  paragraph: {
    marginTop: 10,
    color: 'rgba(15,23,42,0.72)',
    fontSize: 12.8,
    lineHeight: 18,
    fontWeight: '600',
  },

  hr: {
    marginTop: 14,
    marginBottom: 12,
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
  },
  hrSoft: {
    marginTop: 14,
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.06)',
  },

  sectionTitle: { color: '#0F172A', fontSize: 14.5, fontWeight: '900' },

  twoCol: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
  },
  vDivider: {
    width: 1,
    backgroundColor: 'rgba(15,23,42,0.08)',
    marginTop: 2,
  },

  personRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  personText: { color: '#0F172A', fontSize: 13.5, fontWeight: '800' },

  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(248,250,252,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  linkTitle: { color: '#0F172A', fontSize: 12.8, fontWeight: '900' },
  linkSub: { marginTop: 2, color: 'rgba(15,23,42,0.55)', fontSize: 11.5, fontWeight: '700' },

  kvRow: {
    marginTop: 12,
    paddingTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  k: { color: 'rgba(15,23,42,0.55)', fontSize: 12, fontWeight: '900', width: 40 },
  v: { color: '#0F172A', fontSize: 12.5, fontWeight: '700', flex: 1 },

  // Tech groups + chips
  groupBox: {
    borderRadius: 16,
    backgroundColor: 'rgba(248,250,252,0.80)',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 12,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupTitle: { color: '#0F172A', fontSize: 13.5, fontWeight: '900' },

  chipWrap: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
  },
  chipText: { color: 'rgba(15,23,42,0.75)', fontSize: 12, fontWeight: '800' },
});
