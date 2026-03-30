// UltimateWidget.swift
// Home Screen Widget views — small, medium, large families.
// Lives in the Widget Extension target.

import WidgetKit
import SwiftUI

// ── Widget definition ─────────────────────────────────────────────────────────
@main
struct UltimateWidget: Widget {
  let kind = "UltimatePlaybackWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: UltimateWidgetProvider()) { entry in
      UltimateWidgetEntryView(entry: entry)
        .ultimateWidgetBackground()
    }
    .configurationDisplayName("Ultimate Playback")
    .description("Verse of the day, next service, and your role.")
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
  }
}

// ── Root view (switches on family) ───────────────────────────────────────────
struct UltimateWidgetEntryView: View {
  @Environment(\.widgetFamily) var family
  let entry: UltimateEntry

  var body: some View {
    switch family {
    case .systemSmall:  SmallWidgetView(entry: entry)
    case .systemMedium: MediumWidgetView(entry: entry)
    default:            LargeWidgetView(entry: entry)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL — Verse only
// ─────────────────────────────────────────────────────────────────────────────
struct SmallWidgetView: View {
  let entry: UltimateEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("✝ Verse")
        .font(.system(size: 9, weight: .bold))
        .foregroundColor(.yellow)

      if let v = entry.payload?.verse {
        Text("\"\(v.text)\"")
          .font(.system(size: 10))
          .foregroundColor(.white)
          .lineLimit(5)
        Text("— \(v.ref)")
          .font(.system(size: 9, weight: .semibold))
          .foregroundColor(.yellow.opacity(0.8))
      } else {
        Text("Open Ultimate Playback to load verse")
          .font(.system(size: 9))
          .foregroundColor(.gray)
      }

      Spacer()
    }
    .padding(10)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIUM — Verse + Next Service
// ─────────────────────────────────────────────────────────────────────────────
struct MediumWidgetView: View {
  let entry: UltimateEntry

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      // Left — verse
      VStack(alignment: .leading, spacing: 4) {
        Label("Verse", systemImage: "book.closed.fill")
          .font(.system(size: 9, weight: .bold))
          .foregroundColor(.yellow)

        if let v = entry.payload?.verse {
          Text("\"\(v.text)\"")
            .font(.system(size: 10))
            .foregroundColor(.white)
            .lineLimit(4)
          Text("— \(v.ref)")
            .font(.system(size: 9, weight: .semibold))
            .foregroundColor(.yellow.opacity(0.8))
        } else {
          Text("No verse loaded")
            .font(.system(size: 9))
            .foregroundColor(.gray)
        }
        Spacer()
      }
      .frame(maxWidth: .infinity)

      Divider().background(Color.white.opacity(0.1))

      // Right — service + role
      VStack(alignment: .leading, spacing: 4) {
        Label("Service", systemImage: "calendar")
          .font(.system(size: 9, weight: .bold))
          .foregroundColor(.blue)

        if let svc = entry.payload?.nextService {
          Text(svc.name)
            .font(.system(size: 10, weight: .bold))
            .foregroundColor(.white)
            .lineLimit(2)
          Text(svc.date)
            .font(.system(size: 9))
            .foregroundColor(.gray)
        } else {
          Text("No upcoming service")
            .font(.system(size: 9))
            .foregroundColor(.gray)
        }

        if let role = entry.payload?.role, !role.isEmpty {
          HStack(spacing: 3) {
            Image(systemName: "person.fill")
              .font(.system(size: 8))
              .foregroundColor(.purple)
            Text(role)
              .font(.system(size: 9, weight: .semibold))
              .foregroundColor(.purple)
          }
          .padding(.horizontal, 5)
          .padding(.vertical, 2)
          .background(Color.purple.opacity(0.15))
          .clipShape(Capsule())
        }

        Spacer()
      }
      .frame(maxWidth: .infinity)
    }
    .padding(10)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LARGE — Full: Verse + Service + Role + Status
// ─────────────────────────────────────────────────────────────────────────────
struct LargeWidgetView: View {
  let entry: UltimateEntry

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      // App header
      HStack {
        Image(systemName: "music.note.list")
          .foregroundColor(.blue)
        Text("Ultimate Playback")
          .font(.system(size: 11, weight: .bold))
          .foregroundColor(.white)
        Spacer()
        if let ts = entry.payload?.updatedAt {
          Text(shortTime(ts))
            .font(.system(size: 9))
            .foregroundColor(.gray)
        }
      }

      Divider().background(Color.white.opacity(0.1))

      // Verse
      VStack(alignment: .leading, spacing: 3) {
        Label("Verse of the Day", systemImage: "book.closed.fill")
          .font(.system(size: 10, weight: .semibold))
          .foregroundColor(.yellow)

        if let v = entry.payload?.verse {
          Text("\"\(v.text)\"")
            .font(.system(size: 11))
            .foregroundColor(.white)
            .lineLimit(4)
          Text("— \(v.ref)")
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.yellow.opacity(0.8))
        } else {
          Text("Open the app to load today's verse")
            .font(.system(size: 10))
            .foregroundColor(.gray)
        }
      }

      Divider().background(Color.white.opacity(0.1))

      // Next Service
      VStack(alignment: .leading, spacing: 3) {
        Label("Next Service", systemImage: "calendar.badge.clock")
          .font(.system(size: 10, weight: .semibold))
          .foregroundColor(.blue)

        if let svc = entry.payload?.nextService {
          Text(svc.name)
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(.white)
          HStack(spacing: 6) {
            Text(svc.date)
              .font(.system(size: 10))
              .foregroundColor(.gray)
            if let t = svc.time {
              Text(t)
                .font(.system(size: 10))
                .foregroundColor(.gray)
            }
          }
        } else {
          Text("No upcoming services")
            .font(.system(size: 10))
            .foregroundColor(.gray)
        }
      }

      Divider().background(Color.white.opacity(0.1))

      // Role + status
      HStack(spacing: 8) {
        if let role = entry.payload?.role, !role.isEmpty {
          Label(role, systemImage: "person.badge.key.fill")
            .font(.system(size: 10, weight: .semibold))
            .foregroundColor(.purple)
        }

        if let status = entry.payload?.assignmentStatus {
          statusBadge(status)
        }

        Spacer()
      }

      Spacer()
    }
    .padding(12)
  }

  @ViewBuilder
  func statusBadge(_ status: String) -> some View {
    let (label, color): (String, Color) = switch status {
      case "confirmed":  ("✓ Confirmed", .green)
      case "declined":   ("✗ Declined",  .red)
      default:           ("⏳ Pending",   .orange)
    }
    Text(label)
      .font(.system(size: 9, weight: .bold))
      .foregroundColor(color)
      .padding(.horizontal, 6)
      .padding(.vertical, 3)
      .background(color.opacity(0.15))
      .clipShape(Capsule())
  }

  func shortTime(_ iso: String) -> String {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = f.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) {
      let df = DateFormatter()
      df.timeStyle = .short
      return df.string(from: d)
    }
    return ""
  }
}

private extension View {
  @ViewBuilder
  func ultimateWidgetBackground() -> some View {
    if #available(iOSApplicationExtension 17.0, *) {
      self.containerBackground(Color(red: 0.01, green: 0.04, blue: 0.09), for: .widget)
    } else {
      self
        .background(Color(red: 0.01, green: 0.04, blue: 0.09))
    }
  }
}

#if DEBUG
struct UltimateWidget_Previews: PreviewProvider {
  static let sampleEntry = UltimateEntry(
    date: Date(),
    payload: WidgetPayload(
      verse: .init(
        text: "I can do all things through Christ who strengthens me.",
        ref: "Philippians 4:13",
        theme: "strength"
      ),
      nextService: .init(
        name: "Sunday Worship",
        date: "23/03/2026",
        time: "10:00"
      ),
      role: "Vocals",
      assignmentStatus: "confirmed",
      updatedAt: nil
    )
  )

  static var previews: some View {
    Group {
      UltimateWidgetEntryView(entry: sampleEntry)
        .previewContext(WidgetPreviewContext(family: .systemSmall))
      UltimateWidgetEntryView(entry: sampleEntry)
        .previewContext(WidgetPreviewContext(family: .systemMedium))
      UltimateWidgetEntryView(entry: sampleEntry)
        .previewContext(WidgetPreviewContext(family: .systemLarge))
    }
  }
}
#endif
