import { useEffect, useState, useCallback, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';

/**
 * useNetworkStatus — React hook for network state with reconnection callbacks
 *
 * Returns:
 *   isConnected        — boolean (null until first check)
 *   isInternetReachable — boolean (null until first check)
 *   connectionType     — 'wifi' | 'cellular' | 'bluetooth' | 'ethernet' | 'wimax' | 'vpn' | 'other' | 'none' | 'unknown'
 *   details            — NetInfo state details object
 *
 * Usage:
 *   const { isConnected, isInternetReachable } = useNetworkStatus();
 *   const { isConnected } = useNetworkStatus({ onReconnect: flushQueue });
 */

const listeners = new Set();

export function addNetworkListener(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyNetworkListeners(state) {
  listeners.forEach(fn => {
    try { fn(state); } catch (e) { /* noop */ }
  });
}

export default function useNetworkStatus({ onReconnect } = {}) {
  const [state, setState] = useState({
    isConnected: null,
    isInternetReachable: null,
    connectionType: 'unknown',
    details: null,
  });

  const wasOfflineRef = useRef(false);

  useEffect(() => {
    // Initial check
    NetInfo.fetch().then(initial => {
      const next = normalizeState(initial);
      setState(next);
      wasOfflineRef.current = !next.isConnected;
    });

    // Subscribe to changes
    const unsub = NetInfo.addEventListener(info => {
      const next = normalizeState(info);
      setState(prev => {
        const wentOnline = !prev.isConnected && next.isConnected;
        if (wentOnline && onReconnect) {
          // Defer so React state updates first
          setTimeout(() => onReconnect(next), 0);
        }
        wasOfflineRef.current = !next.isConnected;
        return next;
      });
      notifyNetworkListeners(next);
    });

    return () => unsub?.();
  }, [onReconnect]);

  const checkNow = useCallback(() => NetInfo.fetch().then(normalizeState), []);

  return {
    ...state,
    isOffline: state.isConnected === false,
    isOnline: state.isConnected === true,
    checkNow,
  };
}

function normalizeState(info) {
  return {
    isConnected: info?.isConnected ?? false,
    isInternetReachable: info?.isInternetReachable ?? false,
    connectionType: info?.type ?? 'unknown',
    details: info?.details ?? null,
  };
}
