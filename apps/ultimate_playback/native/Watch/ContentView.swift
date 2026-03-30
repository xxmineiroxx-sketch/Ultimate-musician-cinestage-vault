// ContentView.swift
// Apple Watch UI for Ultimate Playback.
// Shows transport controls when a setlist is playing; verse + service info otherwise.
// Lives in the WatchKit Extension target.

import SwiftUI

struct ContentView: View {
  @StateObject private var wc = WatchSessionManager.shared

  var body: some View {
    TabView {
      // ── Page 1 : Transport / Now Playing ─────────────────────────────────
      NowPlayingPage(wc: wc)
        .tag(0)

      // ── Page 2 : Verse of the Day ─────────────────────────────────────────
      VersePage(wc: wc)
        .tag(1)

      // ── Page 3 : Next Service ─────────────────────────────────────────────
      ServicePage(wc: wc)
        .tag(2)
    }
    .tabViewStyle(.page)
  }
}

// ── Now Playing ──────────────────────────────────────────────────────────────
struct NowPlayingPage: View {
  @ObservedObject var wc: WatchSessionManager

  var body: some View {
    VStack(spacing: 6) {
      // Title + artist
      VStack(spacing: 2) {
        Text(wc.songTitle)
          .font(.system(size: 15, weight: .bold))
          .lineLimit(2)
          .multilineTextAlignment(.center)
          .foregroundColor(.white)

        if !wc.artist.isEmpty {
          Text(wc.artist)
            .font(.system(size: 11))
            .foregroundColor(.gray)
            .lineLimit(1)
        }
      }

      // Section label + key/bpm pills
      HStack(spacing: 4) {
        if !wc.sectionLabel.isEmpty {
          Pill(text: wc.sectionLabel, color: .purple)
        }
        if let k = wc.key, !k.isEmpty {
          Pill(text: k, color: .blue)
        }
        if let b = wc.bpm {
          Pill(text: "\(b) bpm", color: .green)
        }
      }

      // Song counter
      if wc.totalSongs > 0 {
        Text("\(wc.songIndex + 1) / \(wc.totalSongs)")
          .font(.system(size: 10))
          .foregroundColor(.gray)
      }

      // Transport controls
      HStack(spacing: 16) {
        TransportBtn(icon: "backward.end.fill", color: .white) {
          wc.send("PREV")
        }

        TransportBtn(
          icon: wc.isPlaying ? "pause.fill" : "play.fill",
          color: wc.isPlaying ? .yellow : .green,
          size: 28
        ) {
          wc.send(wc.isPlaying ? "PAUSE" : "PLAY")
        }

        TransportBtn(icon: "forward.end.fill", color: .white) {
          wc.send("NEXT")
        }
      }
      .padding(.top, 4)

      // Reachability dot
      Circle()
        .fill(wc.isReachable ? Color.green : Color.red.opacity(0.6))
        .frame(width: 6, height: 6)
    }
    .padding(.horizontal, 8)
    .background(Color.black)
  }
}

// ── Verse of the Day ─────────────────────────────────────────────────────────
struct VersePage: View {
  @ObservedObject var wc: WatchSessionManager

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("✝ Verse of the Day")
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(.yellow)

      if wc.verseText.isEmpty {
        Text("Open the app to load verse")
          .font(.system(size: 11))
          .foregroundColor(.gray)
      } else {
        Text("\"\(wc.verseText)\"")
          .font(.system(size: 11))
          .foregroundColor(.white)
          .lineLimit(5)

        Text("— \(wc.verseRef)")
          .font(.system(size: 10, weight: .medium))
          .foregroundColor(.yellow.opacity(0.8))
      }
    }
    .padding(.horizontal, 10)
    .background(Color.black)
  }
}

// ── Next Service ──────────────────────────────────────────────────────────────
struct ServicePage: View {
  @ObservedObject var wc: WatchSessionManager

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("📅 Next Service")
        .font(.system(size: 11, weight: .semibold))
        .foregroundColor(.blue)

      if wc.serviceName.isEmpty {
        Text("No upcoming service")
          .font(.system(size: 11))
          .foregroundColor(.gray)
      } else {
        Text(wc.serviceName)
          .font(.system(size: 13, weight: .bold))
          .foregroundColor(.white)
          .lineLimit(2)

        if !wc.serviceDate.isEmpty {
          Text(wc.serviceDate)
            .font(.system(size: 11))
            .foregroundColor(.gray)
        }

        if !wc.role.isEmpty {
          HStack(spacing: 4) {
            Text("Your Role:")
              .font(.system(size: 10))
              .foregroundColor(.gray)
            Text(wc.role)
              .font(.system(size: 10, weight: .bold))
              .foregroundColor(.purple)
          }
        }
      }
    }
    .padding(.horizontal, 10)
    .background(Color.black)
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
struct TransportBtn: View {
  let icon: String
  let color: Color
  var size: CGFloat = 20
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Image(systemName: icon)
        .resizable()
        .scaledToFit()
        .frame(width: size, height: size)
        .foregroundColor(color)
    }
    .buttonStyle(.plain)
    .frame(width: size + 16, height: size + 16)
    .background(Color.white.opacity(0.08))
    .clipShape(Circle())
  }
}

struct Pill: View {
  let text: String
  let color: Color

  var body: some View {
    Text(text)
      .font(.system(size: 9, weight: .semibold))
      .foregroundColor(color)
      .padding(.horizontal, 5)
      .padding(.vertical, 2)
      .background(color.opacity(0.15))
      .clipShape(Capsule())
  }
}

#Preview {
  ContentView()
}
