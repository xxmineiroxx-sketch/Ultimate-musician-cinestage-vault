/**
 * AnalyticsDashboardScreen — Enterprise analytics for central worship directors.
 * Shows services held, team coverage, top songs, role fill rates, and campus breakdowns.
 *
 * Data: tries GET {CINESTAGE_URL}/api/analytics/services/summary?range=week|month|year
 *       falls back to GET {CINESTAGE_URL}/api/orgs/aggregate?resource=services (compute client-side)
 *       falls back to realistic demo data.
 */
import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CINESTAGE_URL, syncHeaders } from "./config";

// ── Constants ─────────────────────────────────────────────────────────────────

const RANGES = [
  { label: "This Week",  value: "week"  },
  { label: "This Month", value: "month" },
  { label: "This Year",  value: "year"  },
];

const ROLES = [
  "Worship Leader",
  "Keys",
  "Bass",
  "Drums",
  "Guitar",
  "Vocals",
];

const ROLE_SHORT = {
  "Worship Leader": "WL",
  "Keys": "Keys",
  "Bass": "Bass",
  "Drums": "Drms",
  "Guitar": "Gtr",
  "Vocals": "Vox",
};

// ── Demo Data Generator ───────────────────────────────────────────────────────

function buildDemoData(range) {
  const multiplier = range === "week" ? 1 : range === "month" ? 4 : 52;
  const baseServices = Math.round(2 * multiplier);

  const songs = [
    { title: "Gratitude",       artist: "Brandon Lake",  count: Math.round(6 * multiplier * 0.3), campuses: ["Main", "North", "South"] },
    { title: "Way Maker",       artist: "Sinach",        count: Math.round(5 * multiplier * 0.3), campuses: ["Main", "East"]           },
    { title: "Cornerstone",     artist: "Hillsong",      count: Math.round(4 * multiplier * 0.3), campuses: ["North", "South"]         },
    { title: "What A Beautiful Name", artist: "Hillsong Worship", count: Math.round(4 * multiplier * 0.3), campuses: ["Main"]         },
    { title: "Good Grace",      artist: "Hillsong UNITED", count: Math.round(3 * multiplier * 0.3), campuses: ["South", "East"]       },
    { title: "Oceans",          artist: "Hillsong UNITED", count: Math.round(3 * multiplier * 0.3), campuses: ["Main", "North"]       },
  ].sort((a, b) => b.count - a.count);

  // Sparkline: 4 values representing last 4 periods
  const sparkline = [
    Math.max(1, baseServices - 2),
    Math.max(1, baseServices - 1),
    baseServices,
    Math.max(1, baseServices + 1),
  ];

  const campuses = [
    { name: "Main Campus",   services: Math.round(baseServices * 1.1), topSong: songs[0].title, coverage: 91 },
    { name: "North Campus",  services: Math.round(baseServices * 0.9), topSong: songs[2].title, coverage: 78 },
    { name: "South Campus",  services: Math.round(baseServices * 0.8), topSong: songs[4].title, coverage: 65 },
    { name: "East Campus",   services: Math.round(baseServices * 0.7), topSong: songs[1].title, coverage: 45 },
  ];

  const rolesFill = {
    "Worship Leader": 98,
    "Keys":           82,
    "Bass":           75,
    "Drums":          88,
    "Guitar":         70,
    "Vocals":         91,
  };

  return {
    servicesHeld:   baseServices * 4, // across all campuses
    teamCoverage:   Math.round((91 + 78 + 65 + 45) / 4),
    topSong:        songs[0].title,
    activeMembers:  Math.round(18 * (multiplier > 10 ? 1 : multiplier / 10 + 0.5)),
    sparkline,
    songs,
    campuses,
    rolesFill,
    isDemo: true,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Compute stats client-side from raw services aggregate data. */
function computeFromAggregate(rawData, range) {
  // rawData may be { [campusName]: Service[] } or Service[]
  let allServices = [];
  let campusMap = {};

  if (Array.isArray(rawData)) {
    allServices = rawData;
    for (const s of rawData) {
      const cname = s.campusName || s.campus || "Unknown";
      if (!campusMap[cname]) campusMap[cname] = [];
      campusMap[cname].push(s);
    }
  } else if (rawData && typeof rawData === "object") {
    for (const [cname, services] of Object.entries(rawData)) {
      const arr = Array.isArray(services) ? services : [];
      campusMap[cname] = arr;
      allServices = allServices.concat(arr);
    }
  }

  // Song frequency
  const songFreq = {};
  const songCampuses = {};
  for (const svc of allServices) {
    const songs = Array.isArray(svc.songs) ? svc.songs : [];
    for (const song of songs) {
      const title = song.title || song.name || "Unknown";
      songFreq[title] = (songFreq[title] || 0) + 1;
      if (!songCampuses[title]) songCampuses[title] = new Set();
      const cname = svc.campusName || svc.campus || "Unknown";
      songCampuses[title].add(cname);
    }
  }

  const topSongs = Object.entries(songFreq)
    .map(([title, count]) => ({
      title,
      count,
      campuses: Array.from(songCampuses[title] || []),
      artist: "",
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  // Coverage per service
  const coverageValues = [];
  for (const svc of allServices) {
    const team = Array.isArray(svc.team) ? svc.team : [];
    const filled = team.filter((m) => m && (m.id || m.personId || m.name)).length;
    const total = team.length || ROLES.length;
    if (total > 0) coverageValues.push(Math.round((filled / total) * 100));
  }
  const avgCoverage = coverageValues.length
    ? Math.round(coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length)
    : 0;

  // Active members (unique person IDs across all teams)
  const memberSet = new Set();
  for (const svc of allServices) {
    const team = Array.isArray(svc.team) ? svc.team : [];
    for (const m of team) {
      const id = m?.id || m?.personId || m?.name;
      if (id) memberSet.add(id);
    }
  }

  // Per-campus stats
  const campuses = Object.entries(campusMap).map(([name, services]) => {
    const cSongFreq = {};
    for (const svc of services) {
      for (const song of (svc.songs || [])) {
        const t = song.title || song.name || "Unknown";
        cSongFreq[t] = (cSongFreq[t] || 0) + 1;
      }
    }
    const topSong = Object.entries(cSongFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
    const cCovVals = services.map((svc) => {
      const team = Array.isArray(svc.team) ? svc.team : [];
      const filled = team.filter((m) => m && (m.id || m.personId || m.name)).length;
      return team.length ? Math.round((filled / team.length) * 100) : 0;
    });
    const coverage = cCovVals.length
      ? Math.round(cCovVals.reduce((a, b) => a + b, 0) / cCovVals.length)
      : 0;
    return { name, services: services.length, topSong, coverage };
  });

  // Role fill rates
  const rolesFill = {};
  for (const role of ROLES) {
    const roleKey = role.toLowerCase();
    let filledCount = 0;
    for (const svc of allServices) {
      const team = Array.isArray(svc.team) ? svc.team : [];
      const hasRole = team.some((m) => {
        const r = (m?.role || m?.roleLabel || "").toLowerCase();
        return r.includes(roleKey.split(" ")[0]);
      });
      if (hasRole) filledCount++;
    }
    rolesFill[role] = allServices.length
      ? Math.round((filledCount / allServices.length) * 100)
      : 0;
  }

  // Sparkline: dummy 4-point trend from total
  const n = allServices.length;
  const sparkline = [
    Math.max(1, Math.round(n * 0.7)),
    Math.max(1, Math.round(n * 0.85)),
    Math.max(1, Math.round(n * 0.95)),
    n,
  ];

  return {
    servicesHeld: allServices.length,
    teamCoverage: avgCoverage,
    topSong: topSongs[0]?.title || "—",
    activeMembers: memberSet.size,
    sparkline,
    songs: topSongs,
    campuses,
    rolesFill,
    isDemo: false,
  };
}

function coverageColor(pct) {
  if (pct >= 80) return "#10B981"; // green
  if (pct >= 50) return "#F59E0B"; // amber
  return "#EF4444";               // red
}

// ── Sparkline (4-point SVG-style View bars) ───────────────────────────────────

function Sparkline({ values }) {
  const max = Math.max(...values, 1);
  const barW = 8;
  const barGap = 4;
  const maxH = 28;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", height: maxH + 4 }}>
      {values.map((v, i) => {
        const h = Math.max(4, Math.round((v / max) * maxH));
        const isLast = i === values.length - 1;
        return (
          <View
            key={i}
            style={{
              width: barW,
              height: h,
              backgroundColor: isLast ? "#6366F1" : "#334155",
              borderRadius: 2,
              marginRight: i < values.length - 1 ? barGap : 0,
            }}
          />
        );
      })}
    </View>
  );
}

// ── Role Coverage SVG-style bar chart ─────────────────────────────────────────

function RoleBar({ label, pct }) {
  const maxW = Dimensions.get("window").width - 140;
  const filledW = Math.max(4, Math.round((pct / 100) * maxW));
  const color = coverageColor(pct);
  return (
    <View style={styles.roleBarRow}>
      <Text style={styles.roleBarLabel}>{label}</Text>
      <View style={styles.roleBarTrack}>
        <View style={[styles.roleBarFill, { width: filledW, backgroundColor: color }]} />
      </View>
      <Text style={[styles.roleBarPct, { color }]}>{pct}%</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AnalyticsDashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { userRole } = useAuth();
  const [range, setRange] = useState("month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState("demo"); // "live" | "computed" | "demo"

  const load = useCallback(async (r) => {
    setLoading(true);
    setData(null);

    // 1. Try dedicated analytics endpoint
    try {
      const res = await fetch(
        `${CINESTAGE_URL}/api/analytics/services/summary?range=${r}`,
        { headers: syncHeaders() },
      );
      if (res.ok) {
        const json = await res.json();
        if (json && (json.servicesHeld !== undefined || json.services_held !== undefined)) {
          setData({
            servicesHeld:  json.servicesHeld  ?? json.services_held  ?? 0,
            teamCoverage:  json.teamCoverage  ?? json.team_coverage  ?? 0,
            topSong:       json.topSong       ?? json.top_song       ?? "—",
            activeMembers: json.activeMembers ?? json.active_members ?? 0,
            sparkline:     json.sparkline     ?? [0, 0, 0, 0],
            songs:         json.songs         ?? [],
            campuses:      json.campuses      ?? [],
            rolesFill:     json.rolesFill     ?? json.roles_fill     ?? {},
            isDemo: false,
          });
          setDataSource("live");
          setLoading(false);
          return;
        }
      }
    } catch { /* fall through */ }

    // 2. Try aggregate endpoint and compute client-side
    try {
      const res = await fetch(
        `${CINESTAGE_URL}/api/orgs/aggregate?resource=services`,
        { headers: syncHeaders() },
      );
      if (res.ok) {
        const json = await res.json();
        if (json !== null && json !== undefined) {
          const computed = computeFromAggregate(json, r);
          if (computed.servicesHeld > 0 || computed.campuses.length > 0) {
            setData(computed);
            setDataSource("computed");
            setLoading(false);
            return;
          }
        }
      }
    } catch { /* fall through */ }

    // 3. Demo data fallback
    setData(buildDemoData(r));
    setDataSource("demo");
    setLoading(false);
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  // ── Render ──

  // Admin access guard — only admins and leaders may view this screen
  if (userRole !== 'admin' && userRole !== 'leader') {
    return (
      <View style={{ flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#94A3B8', fontSize: 16 }}>Admin access required</Text>
        <Text style={{ color: '#64748B', fontSize: 13, marginTop: 8 }}>Contact your organization administrator</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>📊 Analytics</Text>
          <Text style={styles.headerSub}>Enterprise Reporting</Text>
        </View>
        {/* Data source pill */}
        <View style={[
          styles.sourcePill,
          dataSource === "live"     && styles.sourcePillLive,
          dataSource === "computed" && styles.sourcePillComputed,
          dataSource === "demo"     && styles.sourcePillDemo,
        ]}>
          <Text style={[
            styles.sourcePillText,
            dataSource === "live"     && { color: "#10B981" },
            dataSource === "computed" && { color: "#6366F1" },
            dataSource === "demo"     && { color: "#F59E0B" },
          ]}>
            {dataSource === "live"     ? "● Live data"
             : dataSource === "computed" ? "● Computed"
             : "● Demo data"}
          </Text>
        </View>
      </View>

      {/* Date Range Selector */}
      <View style={styles.rangeBar}>
        {RANGES.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[styles.rangeBtn, range === r.value && styles.rangeBtnActive]}
            onPress={() => setRange(r.value)}
          >
            <Text style={[styles.rangeBtnText, range === r.value && styles.rangeBtnTextActive]}>
              {r.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading || !data ? (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#6366F1" size="large" />
          <Text style={styles.loadingText}>Loading analytics…</Text>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* ── 2×2 Stat Cards ── */}
          <View style={styles.statsGrid}>

            {/* Services Held */}
            <View style={[styles.statCard, styles.statCardHalf]}>
              <Text style={styles.statCardLabel}>Services Held</Text>
              <Text style={styles.statCardValue}>{data.servicesHeld}</Text>
              <Sparkline values={data.sparkline} />
              <Text style={styles.statCardSub}>last 4 periods</Text>
            </View>

            {/* Team Coverage */}
            <View style={[styles.statCard, styles.statCardHalf]}>
              <Text style={styles.statCardLabel}>Team Coverage</Text>
              <Text style={[styles.statCardValue, { color: coverageColor(data.teamCoverage) }]}>
                {data.teamCoverage}%
              </Text>
              {/* Mini coverage arc using bar */}
              <View style={styles.coverageMiniTrack}>
                <View
                  style={[
                    styles.coverageMiniFill,
                    {
                      width: `${data.teamCoverage}%`,
                      backgroundColor: coverageColor(data.teamCoverage),
                    },
                  ]}
                />
              </View>
              <Text style={styles.statCardSub}>avg roles filled</Text>
            </View>

            {/* Top Song */}
            <View style={[styles.statCard, styles.statCardHalf]}>
              <Text style={styles.statCardLabel}>Top Song</Text>
              <Text style={styles.statCardTopSong} numberOfLines={2}>{data.topSong}</Text>
              <Text style={styles.statCardSub}>most played</Text>
            </View>

            {/* Active Members */}
            <View style={[styles.statCard, styles.statCardHalf]}>
              <Text style={styles.statCardLabel}>Active Members</Text>
              <Text style={[styles.statCardValue, { color: "#6366F1" }]}>
                {data.activeMembers}
              </Text>
              <Text style={styles.statCardSub}>distinct participants</Text>
            </View>

          </View>

          {/* ── Campus Breakdown ── */}
          <Text style={styles.sectionTitle}>Campus Breakdown</Text>
          <View style={styles.sectionCard}>
            {data.campuses.length === 0 ? (
              <Text style={styles.emptyText}>No campus data available.</Text>
            ) : (
              data.campuses.map((campus, idx) => (
                <View
                  key={campus.name || idx}
                  style={[styles.campusRow, idx < data.campuses.length - 1 && styles.campusRowBorder]}
                >
                  {/* Name + services */}
                  <View style={styles.campusRowTop}>
                    <Text style={styles.campusName}>{campus.name}</Text>
                    <Text style={styles.campusServiceCount}>{campus.services} services</Text>
                  </View>
                  {/* Top song */}
                  <Text style={styles.campusTopSong}>🎵 {campus.topSong}</Text>
                  {/* Coverage bar */}
                  <View style={styles.campusCoverageRow}>
                    <View style={styles.campusCoverageTrack}>
                      <View
                        style={[
                          styles.campusCoverageFill,
                          {
                            width: `${Math.min(campus.coverage, 100)}%`,
                            backgroundColor: coverageColor(campus.coverage),
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.campusCoveragePct, { color: coverageColor(campus.coverage) }]}>
                      {campus.coverage}%
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* ── Top Songs ── */}
          <Text style={styles.sectionTitle}>Top Songs</Text>
          {data.songs.length === 0 ? (
            <View style={styles.sectionCard}>
              <Text style={styles.emptyText}>No song data available.</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.songScrollContent}
            >
              {data.songs.map((song, idx) => (
                <View key={song.title || idx} style={styles.songPill}>
                  {idx === 0 && (
                    <Text style={styles.songPillRank}>🏆</Text>
                  )}
                  <Text style={styles.songPillTitle} numberOfLines={2}>{song.title}</Text>
                  {song.artist ? (
                    <Text style={styles.songPillArtist} numberOfLines={1}>{song.artist}</Text>
                  ) : null}
                  <View style={styles.songPillCountRow}>
                    <Text style={styles.songPillCount}>{song.count}×</Text>
                  </View>
                  {song.campuses && song.campuses.length > 0 && (
                    <Text style={styles.songPillCampuses} numberOfLines={1}>
                      {song.campuses.slice(0, 3).join(", ")}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          {/* ── Role Coverage Chart ── */}
          <Text style={styles.sectionTitle}>Role Coverage</Text>
          <View style={styles.sectionCard}>
            {ROLES.map((role) => (
              <RoleBar
                key={role}
                label={ROLE_SHORT[role] || role}
                pct={data.rolesFill[role] ?? 0}
              />
            ))}
            {/* Legend */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
                <Text style={styles.legendText}>≥80% Good</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#F59E0B" }]} />
                <Text style={styles.legendText}>50–79% Fair</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
                <Text style={styles.legendText}>&lt;50% Low</Text>
              </View>
            </View>
          </View>

          {/* Bottom padding */}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#020617",
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  backBtnText: {
    color: "#E5E7EB",
    fontSize: 22,
    lineHeight: 28,
    marginTop: -2,
  },
  headerTitle: {
    color: "#F1F5F9",
    fontSize: 18,
    fontWeight: "700",
  },
  headerSub: {
    color: "#64748B",
    fontSize: 12,
    marginTop: 1,
  },
  sourcePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  sourcePillLive: {
    backgroundColor: "#052E16",
    borderColor: "#166534",
  },
  sourcePillComputed: {
    backgroundColor: "#1E1B4B",
    borderColor: "#3730A3",
  },
  sourcePillDemo: {
    backgroundColor: "#1C1009",
    borderColor: "#78350F",
  },
  sourcePillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
  },

  // Range selector
  rangeBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  rangeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    alignItems: "center",
  },
  rangeBtnActive: {
    backgroundColor: "#1E1B4B",
    borderColor: "#6366F1",
  },
  rangeBtnText: {
    color: "#64748B",
    fontSize: 13,
    fontWeight: "600",
  },
  rangeBtnTextActive: {
    color: "#A5B4FC",
  },

  // Loading
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 14,
  },

  // Scroll content
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // 2×2 stat grid
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1E293B",
  },
  statCardHalf: {
    width: "48%",
    flexGrow: 1,
  },
  statCardLabel: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statCardValue: {
    color: "#F1F5F9",
    fontSize: 32,
    fontWeight: "800",
    marginBottom: 8,
    lineHeight: 36,
  },
  statCardTopSong: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
    lineHeight: 20,
    minHeight: 40,
  },
  statCardSub: {
    color: "#475569",
    fontSize: 11,
    marginTop: 4,
  },

  // Coverage mini bar (inside stat card)
  coverageMiniTrack: {
    height: 6,
    backgroundColor: "#1E293B",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 2,
  },
  coverageMiniFill: {
    height: 6,
    borderRadius: 3,
  },

  // Section headings
  sectionTitle: {
    color: "#94A3B8",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  sectionCard: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    marginBottom: 24,
    overflow: "hidden",
  },
  emptyText: {
    color: "#475569",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },

  // Campus rows
  campusRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  campusRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  campusRowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  campusName: {
    color: "#F1F5F9",
    fontSize: 15,
    fontWeight: "700",
  },
  campusServiceCount: {
    color: "#64748B",
    fontSize: 12,
  },
  campusTopSong: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 8,
  },
  campusCoverageRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  campusCoverageTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#1E293B",
    borderRadius: 4,
    overflow: "hidden",
  },
  campusCoverageFill: {
    height: 8,
    borderRadius: 4,
  },
  campusCoveragePct: {
    fontSize: 12,
    fontWeight: "700",
    width: 36,
    textAlign: "right",
  },

  // Top Songs horizontal scroll
  songScrollContent: {
    paddingBottom: 24,
    gap: 10,
    paddingRight: 16,
  },
  songPill: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1E293B",
    padding: 14,
    width: 140,
    minHeight: 110,
    justifyContent: "space-between",
  },
  songPillRank: {
    fontSize: 16,
    marginBottom: 4,
  },
  songPillTitle: {
    color: "#F1F5F9",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 18,
    marginBottom: 4,
  },
  songPillArtist: {
    color: "#64748B",
    fontSize: 11,
    marginBottom: 6,
  },
  songPillCountRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  songPillCount: {
    color: "#6366F1",
    fontSize: 13,
    fontWeight: "700",
  },
  songPillCampuses: {
    color: "#475569",
    fontSize: 10,
  },

  // Role coverage chart
  roleBarRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  roleBarLabel: {
    color: "#94A3B8",
    fontSize: 12,
    fontWeight: "600",
    width: 44,
    textAlign: "right",
  },
  roleBarTrack: {
    flex: 1,
    height: 12,
    backgroundColor: "#1E293B",
    borderRadius: 6,
    overflow: "hidden",
  },
  roleBarFill: {
    height: 12,
    borderRadius: 6,
  },
  roleBarPct: {
    fontSize: 12,
    fontWeight: "700",
    width: 36,
    textAlign: "right",
  },

  // Legend
  legendRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    color: "#64748B",
    fontSize: 11,
  },
});
