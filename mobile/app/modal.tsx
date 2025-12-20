import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

export default function ModalScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View pointerEvents="none" style={styles.bg}>
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>Modal</Text>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.85}>
          <View style={styles.closeBtn}>
            <Ionicons name="close-outline" size={20} color="#E5E7EB" />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Bu bir modal ekran</Text>
        <Text style={styles.cardText}>
          Burayı profil, ayarlar, “feedback detayları” gibi içerikler için kullanabilirsin.
        </Text>

        <TouchableOpacity onPress={() => router.back()} style={styles.primaryBtn} activeOpacity={0.85}>
          <Text style={styles.primaryText}>Kapat</Text>
          <Ionicons name="arrow-forward-outline" size={16} color="#0B1220" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#070B14", padding: 16 },

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
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  title: { color: "#FFFFFF", fontSize: 18, fontWeight: "900" },

  closeBtn: {
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
    marginTop: 14,
    backgroundColor: "rgba(17,24,39,0.78)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.16)",
    padding: 16,
  },
  cardTitle: { color: "#E5E7EB", fontSize: 15, fontWeight: "900" },
  cardText: { marginTop: 8, color: "#94A3B8", fontSize: 12.5, lineHeight: 16 },

  primaryBtn: {
    marginTop: 14,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#34D399",
    borderWidth: 1,
    borderColor: "rgba(52,211,153,0.35)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryText: { color: "#0B1220", fontSize: 13.5, fontWeight: "900" },
});
