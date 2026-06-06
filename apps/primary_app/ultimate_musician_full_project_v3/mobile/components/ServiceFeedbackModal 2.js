/**
 * ServiceFeedbackModal.js
 * Post-service feedback collection modal.
 * Shows 3 star-rating rows (Overall, Service Flow, Team Readiness) + optional notes.
 */
import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";

import { API_URL, syncHeaders } from "../screens/config";

// ── Star Rating Row ────────────────────────────────────────────────────────────
function StarRow({ label, value, onChange }) {
  return (
    <View style={s.starRow}>
      <Text style={s.starLabel}>{label}</Text>
      <View style={s.stars}>
        {[1, 2, 3, 4, 5].map((n) => (
          <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Text style={[s.star, n <= value && s.starFilled]}>
              {n <= value ? "★" : "☆"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.starValue}>{value > 0 ? value : "—"}</Text>
    </View>
  );
}

// ── Main Modal ─────────────────────────────────────────────────────────────────
export default function ServiceFeedbackModal({
  visible,
  onClose,
  serviceId,
  personId,
  serviceName = "Service",
}) {
  const [overall, setOverall] = useState(0);
  const [flow, setFlow] = useState(0);
  const [readiness, setReadiness] = useState(0);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function resetState() {
    setOverall(0);
    setFlow(0);
    setReadiness(0);
    setNotes("");
    setSubmitting(false);
    setSubmitted(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleSubmit() {
    if (overall === 0 || flow === 0 || readiness === 0) {
      Alert.alert("Missing Ratings", "Please rate all three areas before submitting.");
      return;
    }
    if (!personId) {
      Alert.alert("Not Identified", "Could not determine your identity. Please log in and try again.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/services/${serviceId}/feedback`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({
          personId,
          overallRating: overall,
          flowRating: flow,
          teamReadiness: readiness,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Submission failed");
      }
      setSubmitted(true);
    } catch (err) {
      Alert.alert("Error", err.message || "Could not submit feedback. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.overlay}
      >
        <View style={s.card}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.title}>How did the service go?</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>

          {submitted ? (
            /* ── Thank-you state ── */
            <View style={s.thankYou}>
              <Text style={s.thankYouIcon}>🙏</Text>
              <Text style={s.thankYouTitle}>Thanks for your feedback!</Text>
              <Text style={s.thankYouSub}>
                Your response has been recorded and will help improve future services.
              </Text>
              <TouchableOpacity style={s.doneBtn} onPress={handleClose}>
                <Text style={s.doneBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={s.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={s.serviceName} numberOfLines={1}>{serviceName}</Text>

              {/* Star rows */}
              <View style={s.ratingsCard}>
                <StarRow label="Overall" value={overall} onChange={setOverall} />
                <View style={s.divider} />
                <StarRow label="Service Flow" value={flow} onChange={setFlow} />
                <View style={s.divider} />
                <StarRow label="Team Readiness" value={readiness} onChange={setReadiness} />
              </View>

              {/* Notes */}
              <Text style={s.notesLabel}>Any notes for the team?</Text>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Optional — what went well, what to improve…"
                placeholderTextColor="#374151"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={500}
              />
              <Text style={s.charCount}>{notes.length}/500</Text>

              {/* Submit */}
              <TouchableOpacity
                style={[s.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSubmit}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={s.submitBtnText}>Submit Feedback</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
  },
  card: {
    backgroundColor: "#0F172A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#1E293B",
    maxHeight: "90%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  title: {
    color: "#F9FAFB",
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  closeBtn: {
    color: "#64748B",
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    padding: 24,
    paddingBottom: 40,
  },
  serviceName: {
    color: "#94A3B8",
    fontSize: 13,
    marginBottom: 20,
    fontStyle: "italic",
  },
  ratingsCard: {
    backgroundColor: "#1E293B",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#334155",
    paddingHorizontal: 20,
    paddingVertical: 4,
    marginBottom: 24,
  },
  starRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  starLabel: {
    color: "#CBD5E1",
    fontSize: 15,
    fontWeight: "600",
    width: 110,
  },
  stars: {
    flexDirection: "row",
    gap: 6,
    flex: 1,
  },
  star: {
    fontSize: 28,
    color: "#374151",
  },
  starFilled: {
    color: "#F59E0B",
  },
  starValue: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "700",
    width: 24,
    textAlign: "right",
  },
  divider: {
    height: 1,
    backgroundColor: "#1E3A5F",
    marginHorizontal: -20,
  },
  notesLabel: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 10,
  },
  notesInput: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 12,
    padding: 14,
    color: "#F1F5F9",
    fontSize: 14,
    minHeight: 100,
    lineHeight: 20,
  },
  charCount: {
    color: "#374151",
    fontSize: 11,
    textAlign: "right",
    marginTop: 4,
    marginBottom: 24,
  },
  submitBtn: {
    backgroundColor: "#4F46E5",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  submitBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  // Thank-you state
  thankYou: {
    padding: 40,
    alignItems: "center",
    gap: 12,
  },
  thankYouIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  thankYouTitle: {
    color: "#F9FAFB",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  thankYouSub: {
    color: "#64748B",
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  doneBtn: {
    marginTop: 16,
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderWidth: 1,
    borderColor: "#334155",
  },
  doneBtnText: {
    color: "#94A3B8",
    fontSize: 16,
    fontWeight: "700",
  },
});
