import { useEffect, useState } from "react";
import { SafeAreaView, Text, StyleSheet, StatusBar } from "react-native";

export default function TabHome() {
  const [msg, setMsg] = useState("loading...");
  const baseUrl = process.env.EXPO_PUBLIC_API_URL || "";

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",   // siyah ekranı bastır
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: { fontSize: 18, color: "#000", marginBottom: 6 },
  value: { fontSize: 22, fontWeight: "600", color: "#000" },
  hint: { marginTop: 12, fontSize: 12, color: "#555" },
});
