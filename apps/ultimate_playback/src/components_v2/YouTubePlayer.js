/**
 * YouTubePlayer.js
 *
 * Phase 1: Try the YouTube IFrame API (best quality, programmatic control).
 * Phase 2: If the video owner disabled embedding through the IFrame API,
 *           fall back to the YouTube mobile watch page inside the WebView.
 *           We promote the real <video> surface into the frame instead of
 *           relying on the mobile page layout.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Image, Text, Animated } from 'react-native';
import { WebView } from 'react-native-webview';

function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/shorts\/|\/live\/))([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function buildPlayerHtml(videoId) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body { margin:0; padding:0; width:100%; height:100%; background:#000; overflow:hidden; }
      #player { width:100%; height:100%; }
      iframe { position:absolute; inset:0; width:100%; height:100%; border:0; }
    </style>
  </head>
  <body>
    <div id="player"></div>
    <script>
      var player = null;
      function post(type, value) {
        if (!window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, value: value }));
      }
      function onYouTubeIframeAPIReady() {
        player = new YT.Player('player', {
          width: '100%', height: '100%',
          videoId: '${videoId}',
          playerVars: { autoplay:0, controls:0, playsinline:1, rel:0, modestbranding:1, fs:0, disablekb:1 },
          events: {
            onReady: function(e) { post('ready', true); },
            onStateChange: function(e) { post('state', e.data); },
            onError: function(e) { post('error', e.data); }
          }
        });
      }
      window.__upPlay  = function() { try { player && player.playVideo  && player.playVideo();  } catch(e){} };
      window.__upPause = function() { try { player && player.pauseVideo && player.pauseVideo(); } catch(e){} };
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    </script>
  </body>
</html>`;
}

function parseMsg(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function getThumbnailUrl(videoId) {
  if (!videoId) return null;
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

// Errors that mean the video owner blocked embedding
const EMBED_BLOCKED = new Set([100, 101, 150, 152]);
const BLOCKED_EXTERNAL_SCHEMES = /^(youtube:|vnd\.youtube:|intent:|itms-appss?:|mailto:|tel:)/i;

function buildFallbackUrl(videoId) {
  return `https://m.youtube.com/watch?v=${videoId}&playsinline=1&autoplay=0&app=m&persist_app=1&noapp=1`;
}

function buildFallbackBridge(autoPlay) {
  return `
    (function() {
      if (window.__upFallbackBridgeInstalled) return true;
      window.__upFallbackBridgeInstalled = true;

      function post(type, value) {
        if (!window.ReactNativeWebView) return;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, value: value }));
      }

      function hide(selector) {
        try {
          document.querySelectorAll(selector).forEach(function(node) {
            node.style.display = 'none';
          });
        } catch (_) {}
      }

      function hideChrome() {
        hide('header');
        hide('ytm-app-header-layout');
        hide('ytm-pivot-bar-renderer');
        hide('ytm-reel-shelf-renderer');
        hide('ytm-menu-renderer');
        hide('ytm-action-bar-renderer');
        hide('ytm-comments-entry-point-teaser-renderer');
        hide('ytm-watch-next-secondary-results-renderer');
        hide('ytm-expandable-video-description-body-renderer');
        hide('ytm-structured-description-content-renderer');
        hide('ytm-horizontal-card-list-renderer');
      }

      function maybeClickUnmuteUi() {
        try {
          var nodes = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"], div, span'));
          nodes.forEach(function(node) {
            var label = [
              node.getAttribute && node.getAttribute('aria-label'),
              node.getAttribute && node.getAttribute('title'),
              node.textContent
            ].filter(Boolean).join(' ').toLowerCase();
            if (!label) return;
            if (label.includes('tap to unmute') || label === 'unmute' || label.includes('unmute video')) {
              if (typeof node.click === 'function') {
                try { node.click(); } catch (_) {}
              }
              try { node.style.display = 'none'; } catch (_) {}
            }
          });
        } catch (_) {}
      }

      function isolateVideoSurface(video) {
        if (!video) return;
        try {
          document.documentElement.style.margin = '0';
          document.documentElement.style.padding = '0';
          document.documentElement.style.width = '100%';
          document.documentElement.style.height = '100%';
          document.documentElement.style.overflow = 'hidden';
          document.documentElement.style.background = '#000';

          document.body.style.margin = '0';
          document.body.style.padding = '0';
          document.body.style.width = '100%';
          document.body.style.height = '100%';
          document.body.style.overflow = 'hidden';
          document.body.style.background = '#000';

          hideChrome();
          var node = video;
          while (node && node !== document.body) {
            if (node.parentElement) {
              Array.prototype.slice.call(node.parentElement.children).forEach(function(sibling) {
                if (sibling !== node) {
                  sibling.style.display = 'none';
                }
              });
            }
            node.style.display = 'block';
            node.style.visibility = 'visible';
            node.style.opacity = '1';
            node.style.background = '#000';
            node.style.overflow = 'hidden';
            node = node.parentElement;
          }

          var frame = video.parentElement || video;
          if (frame && frame.style) {
            frame.style.position = 'fixed';
            frame.style.inset = '0';
            frame.style.width = '100vw';
            frame.style.height = '100vh';
            frame.style.maxWidth = '100vw';
            frame.style.maxHeight = '100vh';
            frame.style.background = '#000';
            frame.style.zIndex = '2147483646';
          }

          video.setAttribute('playsinline', 'true');
          video.setAttribute('webkit-playsinline', 'true');
          video.style.position = 'absolute';
          video.style.left = '0';
          video.style.top = '0';
          video.style.width = '100%';
          video.style.height = '100%';
          video.style.maxWidth = '100%';
          video.style.maxHeight = '100%';
          video.style.objectFit = 'contain';
          video.style.background = '#000';
          video.style.zIndex = '2147483647';
          video.style.transform = 'none';
        } catch (_) {}
      }

      function scheduleLayout(video) {
        [0, 180, 700].forEach(function(delay) {
          setTimeout(function() {
            isolateVideoSurface(video);
            maybeClickUnmuteUi();
          }, delay);
        });
      }

      function bindVideo() {
        var video = document.querySelector('video');
        if (!video) return false;
        if (window.__upVideo === video) return true;

        window.__upVideo = video;
        scheduleLayout(video);

        function unmuteVideo() {
          try {
            video.muted = false;
            video.defaultMuted = false;
            video.volume = 1;
          } catch (_) {}
          maybeClickUnmuteUi();
        }

        window.__upUnmute = function() {
          unmuteVideo();
          setTimeout(unmuteVideo, 75);
          setTimeout(unmuteVideo, 250);
          setTimeout(unmuteVideo, 750);
          return true;
        };

        window.__upPlay = function() {
          try {
            unmuteVideo();
            var result = video.play();
            if (result && result.catch) result.catch(function() {});
          } catch (_) {}
          setTimeout(unmuteVideo, 50);
          setTimeout(unmuteVideo, 200);
          setTimeout(unmuteVideo, 600);
          return true;
        };

        window.__upPause = function() {
          try { video.pause(); } catch (_) {}
          return true;
        };

        if (!video.__upBound) {
          video.__upBound = true;
          video.addEventListener('play', function() {
            post('state', 1);
          });
          video.addEventListener('pause', function() { post('state', 2); });
          video.addEventListener('ended', function() { post('state', 0); });
          video.addEventListener('loadedmetadata', function() { scheduleLayout(video); });
          video.addEventListener('loadeddata', function() { scheduleLayout(video); });
        }

        post('ready', true);
        ${autoPlay ? 'window.__upUnmute(); window.__upPlay();' : ''}
        return true;
      }

      function boot() {
        hideChrome();
        maybeClickUnmuteUi();
        if (!bindVideo()) {
          setTimeout(boot, 500);
        }
      }

      window.open = function(url) {
        try { window.location.href = url; } catch (_) {}
        return null;
      };

      document.addEventListener('DOMContentLoaded', boot);
      setTimeout(boot, 50);
      setTimeout(boot, 500);
      setTimeout(boot, 1500);

      try {
        var observer = new MutationObserver(function() {
          hideChrome();
          maybeClickUnmuteUi();
          bindVideo();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
      } catch (_) {}

      return true;
    })();
    true;
  `;
}

function shouldStayInsideWebView(url) {
  if (!url) return false;
  if (url === 'about:blank') return true;
  return !BLOCKED_EXTERNAL_SCHEMES.test(url);
}

export default function YouTubePlayer({
  url,
  height = 220,
  style,
  autoPlay = false,
  playing,
  nonce = 0,
  onPlaybackStateChange,
  onEnded,
}) {
  const videoId = useMemo(() => extractVideoId(url), [url]);
  const webViewRef = useRef(null);
  const readyRef = useRef(false);
  // When true, fall back to the YouTube mobile watch page instead of the IFrame API
  const [useWebFallback, setUseWebFallback] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const posterScale = useRef(new Animated.Value(1)).current;
  const html = useMemo(() => (videoId ? buildPlayerHtml(videoId) : null), [videoId]);
  const fallbackUrl = useMemo(() => (videoId ? buildFallbackUrl(videoId) : null), [videoId]);
  const thumbnailUrl = useMemo(() => getThumbnailUrl(videoId), [videoId]);
  const fallbackBridge = useMemo(
    () => buildFallbackBridge(Boolean(autoPlay || playing)),
    [autoPlay, playing]
  );

  useEffect(() => {
    readyRef.current = false;
    setUseWebFallback(false);
    setThumbnailFailed(false);
    posterScale.stopAnimation();
    posterScale.setValue(1);
  }, [videoId, nonce]);

  useEffect(() => {
    if (!useWebFallback) {
      posterScale.stopAnimation();
      posterScale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(posterScale, { toValue: 1.045, duration: 4200, useNativeDriver: true }),
        Animated.timing(posterScale, { toValue: 1, duration: 4200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [posterScale, useWebFallback]);

  useEffect(() => {
    if (!videoId || typeof playing !== 'boolean' || !readyRef.current) return;
    const script = playing
      ? 'window.__upUnmute && window.__upUnmute(); window.__upPlay && window.__upPlay(); true;'
      : 'window.__upPause && window.__upPause(); true;';
    webViewRef.current?.injectJavaScript(script);
  }, [playing, videoId, useWebFallback]);

  if (!videoId || !html) return null;

  // Phase 2: load the watch page inline and promote its native <video> into
  // the frame so playback stays inside the app even when embeds are blocked.
  if (useWebFallback && fallbackUrl) {
    return (
      <View style={[styles.container, { height }, style]}>
        <WebView
          ref={webViewRef}
          key={`fallback:${videoId}:${nonce}`}
          source={{ uri: fallbackUrl }}
          style={styles.webview}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsFullscreenVideo
          originWhitelist={['*']}
          injectedJavaScript={fallbackBridge}
          onShouldStartLoadWithRequest={(request) => shouldStayInsideWebView(request?.url)}
          onMessage={(event) => {
            const payload = parseMsg(event?.nativeEvent?.data);
            if (!payload) return;
            if (payload.type === 'ready') {
              readyRef.current = true;
              if (autoPlay || playing) {
                webViewRef.current?.injectJavaScript('window.__upUnmute && window.__upUnmute(); window.__upPlay && window.__upPlay(); true;');
              }
              return;
            }
            if (payload.type !== 'state') return;
            if (payload.value === 1) onPlaybackStateChange?.(true);
            if (payload.value === 2) onPlaybackStateChange?.(false);
            if (payload.value === 0) {
              onPlaybackStateChange?.(false);
              onEnded?.();
            }
          }}
        />
        <View style={styles.thumbnailOverlay} pointerEvents="none">
          {!thumbnailFailed && thumbnailUrl ? (
            <Animated.Image
              source={{ uri: thumbnailUrl }}
              style={[styles.thumbnailImage, { transform: [{ scale: posterScale }] }]}
              resizeMode="cover"
              onError={() => setThumbnailFailed(true)}
            />
          ) : (
            <View style={styles.thumbnailPlaceholder} />
          )}
          <View style={styles.thumbnailScrim} />
          <View style={styles.audioFallbackCenter}>
            <View style={styles.audioFallbackOrb}>
              <Text style={styles.audioFallbackOrbText}>
                {playing ? '♪' : '▶'}
              </Text>
            </View>
            <Text style={styles.audioFallbackTitle}>
              {playing ? 'Audio Playback Active' : 'Ready To Play'}
            </Text>
            <Text style={styles.audioFallbackSubtitle}>
              Video is restricted by YouTube. Playback stays inside Ultimate Playback.
            </Text>
          </View>
          <View style={styles.thumbnailBadge}>
            <Text style={styles.thumbnailBadgeText}>Audio Mode</Text>
            <Text style={styles.thumbnailBadgeSubtext}>YouTube video fallback</Text>
          </View>
        </View>
      </View>
    );
  }

  // Phase 1: IFrame API
  return (
    <View style={[styles.container, { height }, style]}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <WebView
          ref={webViewRef}
          key={`iframe:${videoId}:${nonce}`}
          source={{ html, baseUrl: 'https://www.youtube.com' }}
          style={styles.webview}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          allowsFullscreenVideo
          originWhitelist={['*']}
          onMessage={(event) => {
            const payload = parseMsg(event?.nativeEvent?.data);
            if (!payload) return;
            if (payload.type === 'ready') {
              readyRef.current = true;
              if (autoPlay || playing) {
                webViewRef.current?.injectJavaScript('window.__upPlay && window.__upPlay(); true;');
              }
              return;
            }
            if (payload.type === 'error') {
              onPlaybackStateChange?.(false);
              if (EMBED_BLOCKED.has(payload.value)) {
                // Video owner disabled embedding — switch to the watch page inline.
                setUseWebFallback(true);
              }
              return;
            }
            if (payload.type !== 'state') return;
            if (payload.value === 1) onPlaybackStateChange?.(true);
            if (payload.value === 2) onPlaybackStateChange?.(false);
            if (payload.value === 0) { onPlaybackStateChange?.(false); onEnded?.(); }
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
  thumbnailOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111827',
  },
  thumbnailScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 7, 18, 0.48)',
  },
  audioFallbackCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  audioFallbackOrb: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(124, 58, 237, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(196, 181, 253, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 8,
  },
  audioFallbackOrbText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginLeft: 2,
  },
  audioFallbackTitle: {
    marginTop: 16,
    color: '#F8FAFC',
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  audioFallbackSubtitle: {
    marginTop: 8,
    maxWidth: 260,
    color: '#CBD5E1',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '600',
  },
  thumbnailBadge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.5)',
  },
  thumbnailBadgeText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  thumbnailBadgeSubtext: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
});
