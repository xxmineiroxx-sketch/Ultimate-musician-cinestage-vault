// LiveServiceScreen.js
// Live Service Mode — shown during an actual service.
// Tracks which song/item is currently active, shows current + next item,
// timer, allows advancing to next item (syncs to PCO Live).

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Animated,
  SafeAreaView,
  StatusBar,
  Platform,
} from 'react-native';
import { getLiveServiceState, advanceLiveItem } from '../services/planningCenterService';

// ─── Colour tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#020617',
  surface:   '#0F172A',
  border:    '#1E293B',
  green:     '#34D399',
  greenDim:  '#065F46',
  indigo:    '#818CF8',
  indigoDim: '#312E81',
  white:     '#F1F5F9',
  muted:     '#64748B',
  dimmed:    '#334155',
  red:       '#F87171',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatSeconds(total) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function parseLengthToSeconds(str) {
  if (!str) return null;
  const parts = String(str).split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

// ─── Hold-to-advance circular progress ────────────────────────────────────────
const HOLD_DURATION = 800; // ms

function HoldButton({ onConfirm, disabled, label }) {
  const progress    = useRef(new Animated.Value(0)).current;
  const holdTimer   = useRef(null);
  const animation   = useRef(null);
  const [holding, setHolding] = useState(false);

  const startHold = useCallback(() => {
    if (disabled) return;
    setHolding(true);
    progress.setValue(0);
    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION,
      useNativeDriver: false,
    });
    animation.current.start(({ finished }) => {
      if (finished) {
        setHolding(false);
        onConfirm();
      }
    });
  }, [disabled, onConfirm, progress]);

  const cancelHold = useCallback(() => {
    if (animation.current) animation.current.stop();
    progress.setValue(0);
    setHolding(false);
  }, [progress]);

  // Arc size
  const SIZE   = 72;
  const STROKE = 5;
  const R      = (SIZE - STROKE) / 2;
  const CIRCUM = 2 * Math.PI * R;

  const strokeDash = progress.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, CIRCUM],
  });

  return (
    <Pressable
      onPressIn={startHold}
      onPressOut={cancelHold}
      disabled={disabled}
      style={[styles.holdButton, disabled && styles.holdButtonDisabled]}
      accessibilityLabel="Hold to advance to next item"
      accessibilityRole="button"
    >
      {/* SVG-like ring drawn with border trick */}
      <View style={[styles.holdRingOuter, { width: SIZE, height: SIZE, borderRadius: SIZE / 2 }]}>
        {/* Background track */}
        <View style={[
          styles.holdRingTrack,
          { width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
        ]} />
        {/* Animated border trick: we overlay a View that grows */}
        <Animated.View style={[
          styles.holdRingFill,
          {
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            borderWidth: STROKE,
            borderColor: C.green,
            opacity: strokeDash.interpolate({ inputRange: [0, CIRCUM], outputRange: [0.3, 1] }),
          },
        ]} />
        <View style={styles.holdButtonInner}>
          <Text style={styles.holdButtonArrow}>→</Text>
          <Text style={styles.holdButtonLabel}>{holding ? 'Hold…' : label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

// ─── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, visible }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, message, opacity]);

  if (!visible && !message) return null;

  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function LiveServiceScreen({ navigation, route }) {
  const {
    serviceTypeId,
    planId,
    creds,
    items = [],
    serviceTitle = 'Live Service',
  } = route?.params ?? {};

  // ── state ──
  const [currentIndex,    setCurrentIndex]    = useState(0);
  const [isRunning,       setIsRunning]       = useState(false);
  const [itemStartTime,   setItemStartTime]   = useState(null);
  const [serviceStartTime,setServiceStartTime]= useState(null);
  const [elapsed,         setElapsed]         = useState(0);   // service total seconds
  const [itemElapsed,     setItemElapsed]     = useState(0);   // current-item seconds
  const [showSetlist,     setShowSetlist]     = useState(false);
  const [syncing,         setSyncing]         = useState(false);
  const [toastMsg,        setToastMsg]        = useState('');
  const [toastVisible,    setToastVisible]    = useState(false);

  const intervalRef   = useRef(null);
  const pollRef       = useRef(null);
  const lastRemoteRef = useRef(null); // track last seen PCO current_item_id

  const currentItem = items[currentIndex] ?? null;
  const nextItem    = items[currentIndex + 1] ?? null;
  const isComplete  = currentIndex >= items.length;

  // ── timer tick ──
  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        const now = Date.now();
        if (serviceStartTime) {
          setElapsed(Math.floor((now - serviceStartTime) / 1000));
        }
        if (itemStartTime) {
          setItemElapsed(Math.floor((now - itemStartTime) / 1000));
        }
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, serviceStartTime, itemStartTime]);

  // ── PCO poll ──
  const pollRemote = useCallback(async () => {
    if (!serviceTypeId || !planId || !creds) return;
    try {
      const state = await getLiveServiceState(serviceTypeId, planId, creds);
      const remoteItemId = state?.current_item_id ?? state?.data?.id;
      if (remoteItemId && remoteItemId !== lastRemoteRef.current) {
        const remoteIdx = items.findIndex(i => String(i.id) === String(remoteItemId));
        if (remoteIdx >= 0 && remoteIdx !== currentIndex) {
          lastRemoteRef.current = remoteItemId;
          setCurrentIndex(remoteIdx);
          setItemStartTime(Date.now());
          setItemElapsed(0);
          showToast('Remote advance detected');
        }
      }
    } catch (_) {
      // silent — PCO may be unavailable offline
    }
  }, [serviceTypeId, planId, creds, items, currentIndex]);

  useEffect(() => {
    if (!isRunning) return;
    pollRef.current = setInterval(pollRemote, 10_000);
    return () => clearInterval(pollRef.current);
  }, [isRunning, pollRemote]);

  // Keep screen awake during live service
  useEffect(() => {
    activateKeepAwakeAsync();
    return () => deactivateKeepAwake();
  }, []);

  // ── helpers ──
  function showToast(msg) {
    setToastMsg(msg);
    setToastVisible(v => {
      if (v) return false; // reset briefly so useEffect fires again
      return true;
    });
    // ensure it fires even if same message
    setTimeout(() => setToastVisible(true), 30);
  }

  function startService() {
    const now = Date.now();
    setIsRunning(true);
    if (!serviceStartTime) setServiceStartTime(now);
    if (!itemStartTime)   setItemStartTime(now);
  }

  function pauseService() {
    setIsRunning(false);
  }

  async function goToIndex(idx, action = 'go_to_item') {
    if (idx < 0 || idx >= items.length) return;
    const targetItem = items[idx];
    setSyncing(true);
    try {
      await advanceLiveItem(serviceTypeId, planId, action, targetItem?.id ?? null, creds);
    } catch (_) {
      // offline/PCO unavailable — continue locally
    } finally {
      setSyncing(false);
    }
    setCurrentIndex(idx);
    setItemStartTime(Date.now());
    setItemElapsed(0);
    lastRemoteRef.current = targetItem?.id ?? null;
  }

  async function goNext() {
    const nextIdx = currentIndex + 1;
    await goToIndex(nextIdx, 'go_to_next_item');
  }

  async function goPrev() {
    const prevIdx = currentIndex - 1;
    if (prevIdx < 0) return;
    await goToIndex(prevIdx, 'go_to_item');
  }

  // ── item length display ──
  function itemLengthDisplay() {
    if (!currentItem) return null;
    const totalSec = parseLengthToSeconds(currentItem.length);
    if (!totalSec) return formatSeconds(itemElapsed);
    return `${formatSeconds(itemElapsed)} / ${formatSeconds(totalSec)}`;
  }

  // ── service complete screen ──
  if (isComplete) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <View style={styles.completeContainer}>
          <Text style={styles.completeEmoji}>🎉</Text>
          <Text style={styles.completeTitle}>Service Complete!</Text>
          <Text style={styles.completeSub}>
            Total time: {formatSeconds(elapsed)}
          </Text>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>← Back to Plan</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── main render ──
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header bar ── */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backPressable}>
          <Text style={styles.headerBack}>✕</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{serviceTitle}</Text>
        <View style={styles.serviceTimerBox}>
          <Text style={styles.serviceTimerLabel}>TOTAL</Text>
          <Text style={styles.serviceTimerValue}>{formatSeconds(elapsed)}</Text>
        </View>
      </View>

      {/* ── NOW PLAYING ── */}
      <View style={styles.nowPlayingSection}>
        <Text style={styles.nowPlayingLabel}>NOW PLAYING</Text>

        <Text style={styles.currentTitle} numberOfLines={2}>
          {currentItem?.title ?? '—'}
        </Text>

        {currentItem?.artist ? (
          <Text style={styles.currentArtist} numberOfLines={1}>
            {currentItem.artist}
          </Text>
        ) : null}

        <View style={styles.currentMeta}>
          {currentItem?.key ? (
            <View style={styles.keyBadge}>
              <Text style={styles.keyBadgeText}>{currentItem.key}</Text>
            </View>
          ) : null}

          <View style={styles.itemTimerBox}>
            <Text style={styles.itemTimerValue}>{itemLengthDisplay()}</Text>
          </View>
        </View>

        {currentItem?.notes ? (
          <Text style={styles.notes} numberOfLines={2}>{currentItem.notes}</Text>
        ) : null}

        {/* Item progress bar */}
        {parseLengthToSeconds(currentItem?.length) ? (
          <View style={styles.progressTrack}>
            <View style={[
              styles.progressFill,
              {
                width: `${Math.min(100, (itemElapsed / parseLengthToSeconds(currentItem.length)) * 100)}%`,
              },
            ]} />
          </View>
        ) : null}
      </View>

      {/* ── UP NEXT ── */}
      <View style={styles.upNextSection}>
        {nextItem ? (
          <>
            <Text style={styles.upNextLabel}>UP NEXT</Text>
            <View style={styles.upNextRow}>
              <Text style={styles.upNextTitle} numberOfLines={1}>
                {nextItem.title}
              </Text>
              {nextItem.key ? (
                <View style={styles.keyBadgeSmall}>
                  <Text style={styles.keyBadgeSmallText}>{nextItem.key}</Text>
                </View>
              ) : null}
            </View>
            {nextItem.artist ? (
              <Text style={styles.upNextArtist}>{nextItem.artist}</Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.upNextLabel}>END OF SERVICE</Text>
        )}
      </View>

      {/* ── Controls ── */}
      <View style={styles.controlsBar}>
        {/* Prev */}
        <Pressable
          style={[styles.controlBtn, currentIndex === 0 && styles.controlBtnDisabled]}
          onPress={goPrev}
          disabled={currentIndex === 0}
        >
          <Text style={styles.controlBtnText}>←</Text>
          <Text style={styles.controlBtnLabel}>Prev</Text>
        </Pressable>

        {/* Play / Pause */}
        <Pressable
          style={[styles.controlBtn, styles.playPauseBtn]}
          onPress={isRunning ? pauseService : startService}
        >
          <Text style={styles.playPauseText}>{isRunning ? '⏸' : '▶'}</Text>
        </Pressable>

        {/* All Songs */}
        <Pressable style={styles.controlBtn} onPress={() => setShowSetlist(true)}>
          <Text style={styles.controlBtnText}>☰</Text>
          <Text style={styles.controlBtnLabel}>All Songs</Text>
        </Pressable>

        {/* NEXT — hold-to-confirm */}
        <HoldButton
          onConfirm={goNext}
          disabled={syncing || currentIndex >= items.length - 1}
          label="Next"
        />
      </View>

      {/* ── Setlist bottom sheet ── */}
      <Modal
        visible={showSetlist}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSetlist(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setShowSetlist(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Setlist · {items.length} items</Text>
          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            {items.map((item, idx) => {
              const isCurrent   = idx === currentIndex;
              const isCompleted = idx < currentIndex;
              return (
                <Pressable
                  key={item.id ?? idx}
                  style={[
                    styles.setlistRow,
                    isCurrent   && styles.setlistRowCurrent,
                    isCompleted && styles.setlistRowDone,
                  ]}
                  onPress={() => {
                    goToIndex(idx, 'go_to_item');
                    setShowSetlist(false);
                  }}
                >
                  <Text style={styles.setlistIndex}>{idx + 1}</Text>
                  <View style={styles.setlistInfo}>
                    <Text
                      style={[
                        styles.setlistItemTitle,
                        isCurrent   && styles.setlistItemTitleCurrent,
                        isCompleted && styles.setlistItemTitleDone,
                      ]}
                      numberOfLines={1}
                    >
                      {isCompleted ? '✓ ' : ''}{item.title}
                    </Text>
                    {item.artist ? (
                      <Text style={styles.setlistItemArtist} numberOfLines={1}>
                        {item.artist}
                      </Text>
                    ) : null}
                  </View>
                  {item.key ? (
                    <View style={[styles.keyBadgeSmall, isCurrent && styles.keyBadgeSmallActive]}>
                      <Text style={styles.keyBadgeSmallText}>{item.key}</Text>
                    </View>
                  ) : null}
                  {isCurrent && (
                    <View style={styles.currentDot} />
                  )}
                </Pressable>
              );
            })}
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* ── Toast ── */}
      <Toast message={toastMsg} visible={toastVisible} />

      {/* ── Syncing indicator ── */}
      {syncing && (
        <View style={styles.syncingBadge} pointerEvents="none">
          <Text style={styles.syncingText}>Syncing…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backPressable: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBack: {
    color: C.muted,
    fontSize: 18,
  },
  headerTitle: {
    flex: 1,
    color: C.white,
    fontSize: 15,
    fontWeight: '600',
    marginHorizontal: 8,
  },
  serviceTimerBox: {
    alignItems: 'flex-end',
  },
  serviceTimerLabel: {
    color: C.muted,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  serviceTimerValue: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // ── Now Playing ──
  nowPlayingSection: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 16,
    justifyContent: 'center',
  },
  nowPlayingLabel: {
    color: C.green,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  currentTitle: {
    color: C.white,
    fontSize: 40,
    fontWeight: '800',
    lineHeight: 46,
    marginBottom: 8,
  },
  currentArtist: {
    color: C.muted,
    fontSize: 18,
    fontWeight: '400',
    marginBottom: 16,
  },
  currentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  keyBadge: {
    backgroundColor: C.indigoDim,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.indigo,
  },
  keyBadgeText: {
    color: C.indigo,
    fontSize: 22,
    fontWeight: '800',
  },
  itemTimerBox: {
    flex: 1,
  },
  itemTimerValue: {
    color: C.white,
    fontSize: 28,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  notes: {
    color: C.muted,
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 4,
    marginBottom: 8,
  },
  progressTrack: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: C.green,
    borderRadius: 2,
  },

  // ── Up Next ──
  upNextSection: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: C.border,
    minHeight: 80,
    justifyContent: 'center',
  },
  upNextLabel: {
    color: C.indigo,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  upNextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  upNextTitle: {
    color: C.white,
    fontSize: 22,
    fontWeight: '600',
    flex: 1,
  },
  upNextArtist: {
    color: C.muted,
    fontSize: 13,
    marginTop: 2,
  },
  keyBadgeSmall: {
    backgroundColor: C.indigoDim,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: C.indigo,
  },
  keyBadgeSmallActive: {
    backgroundColor: C.greenDim,
    borderColor: C.green,
  },
  keyBadgeSmallText: {
    color: C.indigo,
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Controls ──
  controlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.surface,
  },
  controlBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  controlBtnDisabled: {
    opacity: 0.3,
  },
  controlBtnText: {
    color: C.white,
    fontSize: 22,
  },
  controlBtnLabel: {
    color: C.muted,
    fontSize: 10,
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  playPauseBtn: {
    backgroundColor: C.greenDim,
    borderRadius: 32,
    width: 64,
    height: 64,
    borderWidth: 2,
    borderColor: C.green,
  },
  playPauseText: {
    fontSize: 28,
  },

  // ── Hold button ──
  holdButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdButtonDisabled: {
    opacity: 0.3,
  },
  holdRingOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  holdRingTrack: {
    position: 'absolute',
    borderWidth: 5,
    borderColor: C.border,
  },
  holdRingFill: {
    position: 'absolute',
  },
  holdButtonInner: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  holdButtonArrow: {
    color: C.green,
    fontSize: 20,
    fontWeight: '800',
  },
  holdButtonLabel: {
    color: C.muted,
    fontSize: 9,
    marginTop: 1,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── Setlist sheet ──
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '75%',
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: C.dimmed,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetTitle: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sheetScroll: {
    flexGrow: 0,
  },
  setlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  setlistRowCurrent: {
    backgroundColor: '#0A1A0F',
  },
  setlistRowDone: {
    opacity: 0.45,
  },
  setlistIndex: {
    color: C.muted,
    fontSize: 13,
    fontWeight: '600',
    width: 22,
    textAlign: 'right',
  },
  setlistInfo: {
    flex: 1,
  },
  setlistItemTitle: {
    color: C.white,
    fontSize: 15,
    fontWeight: '500',
  },
  setlistItemTitleCurrent: {
    color: C.green,
    fontWeight: '700',
  },
  setlistItemTitleDone: {
    color: C.muted,
  },
  setlistItemArtist: {
    color: C.muted,
    fontSize: 12,
    marginTop: 1,
  },
  currentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.green,
  },

  // ── Toast ──
  toast: {
    position: 'absolute',
    top: 70,
    alignSelf: 'center',
    backgroundColor: C.indigoDim,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: C.indigo,
    zIndex: 999,
  },
  toastText: {
    color: C.indigo,
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Syncing ──
  syncingBadge: {
    position: 'absolute',
    bottom: 100,
    right: 16,
    backgroundColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  syncingText: {
    color: C.muted,
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Complete ──
  completeContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  completeEmoji: {
    fontSize: 72,
    marginBottom: 20,
  },
  completeTitle: {
    color: C.green,
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  completeSub: {
    color: C.muted,
    fontSize: 18,
    marginBottom: 40,
  },
  backButton: {
    backgroundColor: C.surface,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  backButtonText: {
    color: C.white,
    fontSize: 16,
    fontWeight: '600',
  },
});
