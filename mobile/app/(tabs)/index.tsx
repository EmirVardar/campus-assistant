import { useEffect, useState } from "react";
// DÜZELTME 1: 'react-native'den SafeAreaView kaldırıldı
import { Text, StyleSheet, StatusBar, TouchableOpacity } from "react-native";
// DÜZELTME 2: 'react-native-safe-area-context' paketinden import edildi
import { SafeAreaView } from "react-native-safe-area-context";
// DÜZELTME 3: Çıkış yapabilmek için AuthContext'i import et
import { useAuth } from '../../context/AuthContext'; // 2 seviye yukarı

export default function TabHome() {
  const [msg, setMsg] = useState("loading...");
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "";

  // DÜZELTME 4: signOut fonksiyonunu cüzdandan al
  const { signOut } = useAuth();

  // API kontrol kodun (DOKUNULMADI)
  useEffect(() => {
    const url = baseUrl + "/hello";
    fetch(url)
      .then((r) => r.text())
      .then(setMsg)
      .catch((e) => setMsg("api-error"));
  }, [baseUrl]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>API says:</Text>
      <Text style={styles.value}>{msg}</Text>
      <Text style={styles.hint}>{baseUrl}</Text>

      {/* DÜZELTME 5: Çıkış Yap Butonu EKLENDİ */}
      <TouchableOpacity style={styles.logoutButton} onPress={signOut}>
        <Text style={styles.logoutText}>Çıkış Yap (Logout)</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 18, color: "#000", marginBottom: 6 },
  value: { fontSize: 22, fontWeight: "600", color: "#000" },
  hint: { marginTop: 12, fontSize: 12, color: "#555" },

  // Buton stilleri
  logoutButton: {
    marginTop: 50,
    backgroundColor: '#e11d48', // Kırmızı renk
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  logoutText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  }
});