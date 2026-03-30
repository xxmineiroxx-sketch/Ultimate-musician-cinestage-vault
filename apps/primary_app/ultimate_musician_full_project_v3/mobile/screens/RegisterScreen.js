import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";

export default function RegisterScreen({ navigation }) {
  const { pendingVerification, ready, register, userId } = useAuth();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ready) return;
    if (pendingVerification) {
      navigation.reset({ index: 0, routes: [{ name: "Verify" }] });
      return;
    }
    if (userId) {
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    }
  }, [navigation, pendingVerification, ready, userId]);

  const handleRegister = async () => {
    if (!name.trim() || !identifier.trim() || !password) {
      Alert.alert(
        "Missing info",
        "Name, email/phone, and password are required.",
      );
      return;
    }
    setLoading(true);
    try {
      const data = await register(identifier.trim(), password, name.trim());
      navigation.reset({
        index: 0,
        routes: [{ name: data.needsVerification ? "Verify" : "Home" }],
      });
    } catch (err) {
      Alert.alert("Registration failed", String(err.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Account</Text>
      <Text style={styles.subtitle}>
        Your church or organization must add you first. We will email a code to
        finish creating your account on this device.
      </Text>

      <Text style={styles.label}>Your Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="First Last"
        placeholderTextColor={colors.subtle}
        autoCapitalize="words"
      />

      <Text style={styles.label}>Email or Phone Number</Text>
      <TextInput
        style={styles.input}
        value={identifier}
        onChangeText={setIdentifier}
        placeholder="email@example.com or phone number"
        placeholderTextColor={colors.subtle}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Create a password"
        placeholderTextColor={colors.subtle}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.6 }]}
        onPress={handleRegister}
        disabled={loading}
      >
        <Text style={styles.buttonText}>Create Account</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.link} onPress={() => navigation.goBack()}>
        <Text style={styles.linkText}>Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 20,
      justifyContent: "center",
    },
    title: {
      color: colors.text,
      fontSize: 24,
      fontWeight: "700",
    },
    subtitle: {
      color: colors.muted,
      marginTop: 6,
      marginBottom: 20,
    },
    label: {
      color: colors.muted,
      fontSize: 12,
      marginBottom: 6,
    },
    input: {
      backgroundColor: colors.card,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.borderAlt,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: colors.text,
      fontSize: 14,
      marginBottom: 12,
    },
    button: {
      backgroundColor: colors.pillActive,
      borderRadius: 999,
      paddingVertical: 12,
      alignItems: "center",
      marginTop: 6,
    },
    buttonText: {
      color: "#FFFFFF",
      fontWeight: "600",
    },
    link: {
      marginTop: 12,
      alignItems: "center",
    },
    linkText: {
      color: colors.link,
    },
  });
