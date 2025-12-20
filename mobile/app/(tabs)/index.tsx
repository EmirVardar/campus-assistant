import { useEffect, useState } from "react";
import { Text, StyleSheet, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../context/AuthContext";

export default function TabHome() {
  const [msg, setMsg] = useState<string>("loading...");
  const [busy, setBusy] = useState(false);

  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "";
  const { signOut } = useAuth();

  useEffect(() => {
    let mounted = true;
    setBusy(true);

    const url = baseUrl + "/hello";
    fetch(url)
      .then((r) => r.text())
      .then((t) => mounted && setMsg(t))
      .catch(() => mounted && setMsg("api-error"))
      .finally(() => mounted && setBusy(false));

    return () => { mounted = false; };
  }, [baseUrl]);

  const ok = msg !== "api-error" && msg !== "loading...";

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* arka plan glow */}
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </View>

      <View style={styles.header}>
        <View style={styles.logo}>
          <Ionicons name="school-outline" size={20} color="#D1FAE5" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Home</Text>
          <Text style={styles.subtitle}>Sistem bağlantı durumu</Text>
        </View>

        <TouchableOpacity onPress={signOut} activeOpacity={0.85}>
          <View style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={18} color="#E5E7EB" />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.statusDot, ok ? styles.dotOk : styles.dotBad]} />
          <Text style={styles.cardTitle}>{ok ? "Bağlantı aktif" : "Bağlantı hatası"}</Text>
          {busy && <ActivityIndicator size="small" color="#E5E7EB" style={{ marginLeft: "auto" }} />}
        </View>

        <Text style={styles.value} numberOfLines={3}>
          {msg}
        </Text>

        <View style={styles.kvRow}>
          <Text style={styles.k}>API</Text>
          <Text style={styles.v} numberOfLines={1}>{baseUrl || "-"}</Text>
        </View>

        <Text style={styles.hint}>
          Bu ekran demo/test amaçlıdır. İstersen buraya “Duyuru özetleri”, “Son aktiviteler”, “Hızlı menü” ekleyebiliriz.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070B14", paddingHorizontal: 16 },

  bg: { ...StyleSheet.absoluteFillObject, backgroundColor: "#070B14" },
  glowTop: {
    position: "absolute",
    top: -160,
    left: -140,
    width: 360,
    height: 360,
    borderRadius: 999,
    backgroundColor: "rgba(16,185,129,0.20)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -180,
    right: -150,
    width: 380,
    height: 380,
    borderRadius: 999,
    backgroundColor: "rgba(59,130,246,0.16)",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: "rgba(16,185,129,0.14)",
    borderWidth: 1,
    borderColor: "rgba(16,185,129,0.30)",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },
  subtitle: { color: "#94A3B8", fontSize: 12.5, marginTop: 2 },

  logoutBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "rgba(17,24,39,0.72)",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },

  card: {
    backgroundColor: "rgba(17,24,39,0.78)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    padding: 16,
  },

  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 999 },
  dotOk: { backgroundColor: "#34D399" },
  dotBad: { backgroundColor: "#FCA5A5" },

  cardTitle: { color: "#E5E7EB", fontSize: 14.5, fontWeight: "800" },

  value: {
    marginTop: 10,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },

  kvRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(148,163,184,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  k: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "800",
    width: 40,
  },
  v: { color: "#E5E7EB", fontSize: 12.5, flex: 1 },

  hint: { marginTop: 12, color: "#94A3B8", fontSize: 12.5, lineHeight: 16 },
});
