/**
 * BillingScreen — Subscription & plan upgrade screen for Ultimate Musician.
 * Church organizations can view their current plan and upgrade to a higher tier.
 *
 * Plans:
 *   Starter  — $29/mo  — 1 campus, 20 members
 *   Growth   — $79/mo  — 3 campuses, 60 members (Popular)
 *   Network  — $199/mo — Unlimited campuses & members
 *
 * On "Choose X": POST {CINESTAGE_URL}/api/billing/checkout → { checkoutUrl }
 *                → Linking.openURL(checkoutUrl)
 *
 * Manage Subscription: GET {CINESTAGE_URL}/api/billing/portal → { portalUrl }
 *                      → Linking.openURL(portalUrl)
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { CINESTAGE_URL, syncHeaders } from "./config";

// ── Plan definitions ──────────────────────────────────────────────────────────
const PLANS = [
  {
    id: "starter",
    name: "Starter",
    badge: null,
    priceMonthly: 29,
    priceAnnual: 290,   // ~$24.17/mo — saves 17%
    description: "1 campus · 20 members",
    features: [
      "Song library",
      "Setlists",
      "Assignments",
      "Rehearsal tools",
    ],
    popular: false,
    highlight: false,
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Most Popular",
    priceMonthly: 79,
    priceAnnual: 790,   // ~$65.83/mo — saves 17%
    description: "3 campuses · 60 members",
    features: [
      "Everything in Starter",
      "AI features",
      "Stem mixer",
      "CineStage™",
      "Smart Analyze",
    ],
    popular: true,
    highlight: true,
  },
  {
    id: "network",
    name: "Network",
    badge: null,
    priceMonthly: 199,
    priceAnnual: 1990,  // ~$165.83/mo — saves 17%
    description: "Unlimited campuses & members",
    features: [
      "Everything in Growth",
      "Central Command",
      "Analytics dashboard",
      "Priority support",
      "Custom integrations",
    ],
    popular: false,
    highlight: false,
  },
];

// Map AsyncStorage `um_plan_tier` values → which plan card to mark as current
const TIER_TO_PLAN_ID = {
  FREE: null,
  LITE: null,
  PREMIUM: "starter",
  PRO: "growth",
  ENTERPRISE: "network",
};

// Human-readable tier labels for the current plan card
const TIER_LABELS = {
  FREE: "Free",
  LITE: "Free",
  PREMIUM: "Starter",
  PRO: "Growth",
  ENTERPRISE: "Network",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function BillingScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  const [annual, setAnnual] = useState(false);
  const [currentTier, setCurrentTier] = useState("FREE");
  const [subscriptionStatus, setSubscriptionStatus] = useState("free"); // "free" | "active" | "past_due" | "canceled"
  const [seatCount, setSeatCount] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [checkingOut, setCheckingOut] = useState(null); // plan id being checked out
  const [openingPortal, setOpeningPortal] = useState(false);
  const [checkoutBanner, setCheckoutBanner] = useState(false);

  // Load plan tier + subscription status from storage / server
  useEffect(() => {
    (async () => {
      setLoadingPlan(true);
      try {
        const [tier, status, seats] = await Promise.all([
          AsyncStorage.getItem("um_plan_tier"),
          AsyncStorage.getItem("um_subscription_status"),
          AsyncStorage.getItem("um_seat_count"),
        ]);
        if (tier) setCurrentTier(tier.toUpperCase());
        if (status) setSubscriptionStatus(status);
        if (seats) setSeatCount(parseInt(seats, 10) || null);
      } catch { /* keep defaults */ }

      // Also refresh from server
      try {
        const res = await fetch(`${CINESTAGE_URL}/api/billing/status`, {
          headers: syncHeaders(),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.tier) {
            const t = data.tier.toUpperCase();
            setCurrentTier(t);
            await AsyncStorage.setItem("um_plan_tier", t);
          }
          if (data.status) {
            setSubscriptionStatus(data.status);
            await AsyncStorage.setItem("um_subscription_status", data.status);
          }
          if (data.seats != null) {
            setSeatCount(data.seats);
            await AsyncStorage.setItem("um_seat_count", String(data.seats));
          }
        }
      } catch { /* server unreachable — use cached values */ }

      setLoadingPlan(false);
    })();
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handleChoosePlan = useCallback(async (plan) => {
    setCheckingOut(plan.id);
    setCheckoutBanner(false);
    try {
      const res = await fetch(`${CINESTAGE_URL}/api/billing/checkout`, {
        method: "POST",
        headers: syncHeaders(),
        body: JSON.stringify({ plan: plan.id, annual }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const { checkoutUrl } = await res.json();
      if (!checkoutUrl) throw new Error("No checkout URL returned.");
      await Linking.openURL(checkoutUrl);
      setCheckoutBanner(true);
    } catch (err) {
      Alert.alert(
        "Checkout Unavailable",
        err.message || "Could not open checkout. Please try again.",
        [{ text: "OK" }],
      );
    } finally {
      setCheckingOut(null);
    }
  }, [annual]);

  const handleManageSubscription = useCallback(async () => {
    setOpeningPortal(true);
    try {
      const res = await fetch(`${CINESTAGE_URL}/api/billing/portal`, {
        headers: syncHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { portalUrl } = await res.json();
      if (!portalUrl) throw new Error("No portal URL returned.");
      await Linking.openURL(portalUrl);
    } catch (err) {
      Alert.alert(
        "Portal Unavailable",
        err.message || "Could not open the subscription portal. Please try again.",
        [{ text: "OK" }],
      );
    } finally {
      setOpeningPortal(false);
    }
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const currentPlanId = TIER_TO_PLAN_ID[currentTier] || null;
  const isFree = currentTier === "FREE" || currentTier === "LITE";
  const currentTierLabel = TIER_LABELS[currentTier] || currentTier;

  function formatPrice(plan) {
    if (annual) {
      const perMonth = Math.round(plan.priceAnnual / 12);
      return `$${perMonth}/mo`;
    }
    return `$${plan.priceMonthly}/mo`;
  }

  function formatBilledAs(plan) {
    if (annual) return `Billed $${plan.priceAnnual}/yr`;
    return "Billed monthly";
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backBtnText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Upgrade Plan</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Checkout banner ── */}
        {checkoutBanner && (
          <View style={styles.checkoutBanner}>
            <Text style={styles.checkoutBannerIcon}>🌐</Text>
            <Text style={styles.checkoutBannerText}>
              Complete checkout in your browser, then return here. Pull down to refresh your plan status.
            </Text>
            <TouchableOpacity
              onPress={() => setCheckoutBanner(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.checkoutBannerClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Current Plan Card ── */}
        <View style={styles.currentPlanCard}>
          {loadingPlan ? (
            <ActivityIndicator color="#6366F1" />
          ) : (
            <>
              <View style={styles.currentPlanRow}>
                <View>
                  <Text style={styles.currentPlanLabel}>CURRENT PLAN</Text>
                  <Text style={styles.currentPlanName}>{currentTierLabel}</Text>
                </View>
                <StatusBadge status={subscriptionStatus} />
              </View>
              {seatCount != null && (
                <Text style={styles.currentPlanSeats}>
                  {seatCount} seat{seatCount !== 1 ? "s" : ""} in use
                </Text>
              )}
              {isFree && (
                <Text style={styles.currentPlanFreeNote}>
                  You're on the free plan. Upgrade to unlock AI tools, stem mixing, and more.
                </Text>
              )}
            </>
          )}
        </View>

        {/* ── Billing toggle ── */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            style={[styles.toggleBtn, !annual && styles.toggleBtnActive]}
            onPress={() => setAnnual(false)}
          >
            <Text style={[styles.toggleBtnText, !annual && styles.toggleBtnTextActive]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, annual && styles.toggleBtnActive]}
            onPress={() => setAnnual(true)}
          >
            <Text style={[styles.toggleBtnText, annual && styles.toggleBtnTextActive]}>
              Annual
            </Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>Save 17%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Plan Cards ── */}
        <Text style={styles.sectionLabel}>Choose a Plan</Text>

        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const isLoading = checkingOut === plan.id;

          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={isCurrent}
              isLoading={isLoading}
              formatPrice={formatPrice}
              formatBilledAs={formatBilledAs}
              onChoose={handleChoosePlan}
            />
          );
        })}

        {/* ── Manage Subscription ── */}
        {!isFree && (
          <TouchableOpacity
            style={styles.manageSubBtn}
            onPress={handleManageSubscription}
            disabled={openingPortal}
            activeOpacity={0.7}
          >
            {openingPortal ? (
              <ActivityIndicator color="#6366F1" size="small" />
            ) : (
              <>
                <Text style={styles.manageSubIcon}>⚙️</Text>
                <Text style={styles.manageSubText}>Manage Subscription</Text>
                <Text style={styles.manageSubArrow}>›</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* ── Footer note ── */}
        <Text style={styles.footerNote}>
          All plans include a 14-day free trial. Cancel anytime. Prices are per organization.
          {"\n"}Questions? Contact billing@ultimatelabs.co
        </Text>
      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    active:   { label: "Active",   bg: "#052E1C", border: "#10B981", color: "#34D399" },
    free:     { label: "Free",     bg: "#0F172A", border: "#374151", color: "#6B7280" },
    past_due: { label: "Past Due", bg: "#450A0A", border: "#EF4444", color: "#FCA5A5" },
    canceled: { label: "Canceled", bg: "#1C1C1C", border: "#6B7280", color: "#9CA3AF" },
  };
  const style = map[status] || map.free;
  return (
    <View style={[styles.statusBadge, { backgroundColor: style.bg, borderColor: style.border }]}>
      <Text style={[styles.statusBadgeText, { color: style.color }]}>
        {style.label}
      </Text>
    </View>
  );
}

function PlanCard({ plan, isCurrent, isLoading, formatPrice, formatBilledAs, onChoose }) {
  return (
    <View style={[
      styles.planCard,
      plan.highlight && styles.planCardHighlight,
      isCurrent && styles.planCardCurrent,
    ]}>
      {/* Popular badge */}
      {plan.badge && (
        <View style={styles.popularBadge}>
          <Text style={styles.popularBadgeText}>{plan.badge}</Text>
        </View>
      )}

      {/* Plan header */}
      <View style={styles.planCardHeader}>
        <View style={styles.planCardNameRow}>
          <Text style={styles.planCardName}>{plan.name}</Text>
          {isCurrent && (
            <View style={styles.currentBadge}>
              <Text style={styles.currentBadgeText}>Current</Text>
            </View>
          )}
        </View>
        <View style={styles.planPriceBlock}>
          <Text style={styles.planPrice}>{formatPrice(plan)}</Text>
          <Text style={styles.planBilledAs}>{formatBilledAs(plan)}</Text>
        </View>
      </View>

      {/* Description */}
      <Text style={styles.planDescription}>{plan.description}</Text>

      {/* Divider */}
      <View style={styles.planDivider} />

      {/* Features */}
      <View style={styles.planFeatures}>
        {plan.features.map((f) => (
          <View key={f} style={styles.planFeatureRow}>
            <Text style={[styles.planFeatureCheck, plan.highlight && { color: "#818CF8" }]}>
              ✓
            </Text>
            <Text style={styles.planFeatureText}>{f}</Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <TouchableOpacity
        style={[
          styles.planCTA,
          plan.highlight && styles.planCTAHighlight,
          isCurrent && styles.planCTACurrent,
        ]}
        onPress={() => !isCurrent && onChoose(plan)}
        disabled={isCurrent || isLoading}
        activeOpacity={0.75}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[
            styles.planCTAText,
            isCurrent && styles.planCTATextCurrent,
          ]}>
            {isCurrent ? "Current Plan" : `Choose ${plan.name}`}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020617",
  },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  backBtn: {
    minWidth: 60,
  },
  backBtnText: {
    color: "#818CF8",
    fontSize: 16,
    fontWeight: "600",
  },
  headerTitle: {
    color: "#F9FAFB",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  headerSpacer: {
    minWidth: 60,
  },

  // ── Scroll ──
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },

  // ── Checkout banner ──
  checkoutBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#1E1B4B",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4338CA",
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  checkoutBannerIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  checkoutBannerText: {
    flex: 1,
    color: "#C7D2FE",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  checkoutBannerClose: {
    color: "#6B7280",
    fontSize: 16,
    fontWeight: "600",
    paddingLeft: 4,
  },

  // ── Current plan card ──
  currentPlanCard: {
    backgroundColor: "#0F172A",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 18,
    marginBottom: 20,
  },
  currentPlanRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  currentPlanLabel: {
    color: "#4B5563",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  currentPlanName: {
    color: "#F9FAFB",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  currentPlanSeats: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
  },
  currentPlanFreeNote: {
    color: "#6B7280",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },

  // ── Status badge ──
  statusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },

  // ── Toggle row ──
  toggleRow: {
    flexDirection: "row",
    backgroundColor: "#0F172A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 9,
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: "#1E1B4B",
    shadowColor: "#4F46E5",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  toggleBtnText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "700",
  },
  toggleBtnTextActive: {
    color: "#E0E7FF",
  },
  saveBadge: {
    backgroundColor: "#78350F",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  saveBadgeText: {
    color: "#FCD34D",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.3,
  },

  // ── Section label ──
  sectionLabel: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },

  // ── Plan card ──
  planCard: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 20,
    marginBottom: 14,
    position: "relative",
    overflow: "hidden",
  },
  planCardHighlight: {
    borderColor: "#6366F1",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
    backgroundColor: "#0D1428",
  },
  planCardCurrent: {
    borderColor: "#374151",
    opacity: 0.85,
  },

  // Popular badge (amber)
  popularBadge: {
    position: "absolute",
    top: 16,
    right: 16,
    backgroundColor: "#78350F",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  popularBadgeText: {
    color: "#FCD34D",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },

  // Card header
  planCardHeader: {
    marginBottom: 6,
    paddingRight: 90, // space for popular badge
  },
  planCardNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  planCardName: {
    color: "#F9FAFB",
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  currentBadge: {
    backgroundColor: "#1E293B",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#374151",
  },
  currentBadgeText: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "700",
  },
  planPriceBlock: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  planPrice: {
    color: "#F9FAFB",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  planBilledAs: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "500",
  },

  // Description
  planDescription: {
    color: "#94A3B8",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 14,
  },

  // Divider
  planDivider: {
    height: 1,
    backgroundColor: "#1E293B",
    marginBottom: 14,
  },

  // Features
  planFeatures: {
    gap: 8,
    marginBottom: 20,
  },
  planFeatureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  planFeatureCheck: {
    color: "#10B981",
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    width: 16,
  },
  planFeatureText: {
    color: "#CBD5E1",
    fontSize: 14,
    fontWeight: "500",
    lineHeight: 20,
    flex: 1,
  },

  // CTA button
  planCTA: {
    backgroundColor: "#1E293B",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  planCTAHighlight: {
    backgroundColor: "#4F46E5",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  planCTACurrent: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  planCTAText: {
    color: "#E2E8F0",
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  planCTATextCurrent: {
    color: "#4B5563",
  },

  // ── Manage subscription ──
  manageSubBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F172A",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginTop: 6,
    marginBottom: 24,
    gap: 10,
  },
  manageSubIcon: {
    fontSize: 18,
  },
  manageSubText: {
    flex: 1,
    color: "#818CF8",
    fontSize: 15,
    fontWeight: "700",
  },
  manageSubArrow: {
    color: "#4B5563",
    fontSize: 22,
    fontWeight: "300",
  },

  // ── Footer ──
  footerNote: {
    color: "#374151",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 8,
  },
});
