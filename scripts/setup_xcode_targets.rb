#!/usr/bin/env ruby
# setup_xcode_targets.rb
# Uses the xcodeproj gem to:
#   1. Add WatchBridgeModule + WidgetDataModule source files to the iOS app target
#   2. Create the WatchKit App target + copy Watch Swift files
#   3. Create the Widget Extension target + copy Widget Swift files
#   4. Wire App Groups entitlements for Watch and Widget targets
#   5. Add WatchConnectivity.framework
#
# Run from UltimatePlayback_RUN/:
#   ruby scripts/setup_xcode_targets.rb

require 'xcodeproj'
require 'fileutils'

PROJECT_ROOT  = File.expand_path('..', __dir__)
IOS_DIR       = File.join(PROJECT_ROOT, 'ios')
XCODEPROJ     = File.join(IOS_DIR, 'UltimatePlayback.xcodeproj')
APP_TARGET    = 'UltimatePlayback'
BUNDLE_ID     = 'com.ultimatemusician.playback'
APP_GROUP     = 'group.com.ultimatemusician.playback'
NATIVE_DIR    = File.join(PROJECT_ROOT, 'native')
SWIFT_VERSION = '5.0'

abort "ios/ not found — run `npx expo prebuild --platform ios` first" unless Dir.exist?(IOS_DIR)
abort "xcodeproj not found at #{XCODEPROJ}" unless Dir.exist?(XCODEPROJ)

project = Xcodeproj::Project.open(XCODEPROJ)

# ── Helper: find target by name ───────────────────────────────────────────────
def find_target(project, name)
  project.targets.find { |t| t.name == name }
end

# ── Helper: add source file to a group + target (idempotent) ─────────────────
def add_source(project, group, target, file_path, display_name = nil)
  display_name ||= File.basename(file_path)
  return if group.files.any? { |f| f.display_name == display_name }
  ref = group.new_reference(file_path)
  ref.name = display_name
  ref.source_tree = '<group>'
  target.source_build_phase.add_file_reference(ref)
  puts "  + #{display_name}"
end

# ── Helper: set Swift version + bridging header on a target ──────────────────
def configure_swift(target, bridging_header: nil)
  target.build_configurations.each do |cfg|
    cfg.build_settings['SWIFT_VERSION'] = SWIFT_VERSION
    cfg.build_settings['SWIFT_OBJC_BRIDGING_HEADER'] = bridging_header if bridging_header
  end
end

# ── Helper: add App Groups entitlement plist ─────────────────────────────────
def write_entitlements(path, app_group, extra = {})
  plist = {
    'com.apple.security.application-groups' => [app_group],
  }.merge(extra)
  Xcodeproj::Plist.write_to_path(plist, path)
  puts "  ~ entitlements: #{File.basename(path)}"
end

# ── Helper: add framework to a target ────────────────────────────────────────
def add_framework(project, target, framework_name)
  sdk_root = '/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/SDKs'
  # Use a platform-relative path so it works for both iOS and watchOS targets
  ref = project.frameworks_group.new_reference("System/Library/Frameworks/#{framework_name}.framework")
  ref.source_tree = 'SDKROOT'
  ref.last_known_file_type = 'wrapper.framework'
  ref.name = "#{framework_name}.framework"
  phase = target.frameworks_build_phase
  return if phase.files.any? { |f| f.display_name == "#{framework_name}.framework" }
  phase.add_file_reference(ref)
  puts "  + #{framework_name}.framework"
end

# ════════════════════════════════════════════════════════════════════════════════
puts "\n[1/4] Adding native RN modules to iOS app target..."
# ════════════════════════════════════════════════════════════════════════════════
app_target   = find_target(project, APP_TARGET)
abort "Target '#{APP_TARGET}' not found!" unless app_target

app_group_ref = project.main_group.find_subpath(APP_TARGET) ||
                project.main_group.new_group(APP_TARGET, APP_TARGET)

rn_files = %w[WatchBridgeModule.swift WatchBridgeModule.m WidgetDataModule.swift WidgetDataModule.m]
rn_files.each do |f|
  src = File.join(IOS_DIR, APP_TARGET, f)
  add_source(project, app_group_ref, app_target, src)
end

# Bridging header
configure_swift(app_target,
  bridging_header: "#{APP_TARGET}/UltimatePlayback-Bridging-Header.h")

# Add WatchConnectivity to iOS app target
add_framework(project, app_target, 'WatchConnectivity')

# ════════════════════════════════════════════════════════════════════════════════
puts "\n[2/4] Creating Watch App target..."
# ════════════════════════════════════════════════════════════════════════════════
WATCH_TARGET_NAME = 'UltimatePlaybackWatch'
WATCH_BUNDLE_ID   = "#{BUNDLE_ID}.watchkitapp"
WATCH_DEPLOY      = '7.0'

watch_dir = File.join(IOS_DIR, WATCH_TARGET_NAME)
FileUtils.mkdir_p(watch_dir)

# Copy Watch Swift sources
%w[WatchApp.swift ContentView.swift WatchSessionManager.swift].each do |f|
  src  = File.join(NATIVE_DIR, 'Watch', f)
  dest = File.join(watch_dir, f)
  FileUtils.cp(src, dest) unless File.exist?(dest)
end

unless find_target(project, WATCH_TARGET_NAME)
  watch_target = project.new_target(
    :watch2_app,
    WATCH_TARGET_NAME,
    :watchos,
    WATCH_DEPLOY
  )

  # Build settings
  watch_target.build_configurations.each do |cfg|
    cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = WATCH_BUNDLE_ID
    cfg.build_settings['SWIFT_VERSION']             = SWIFT_VERSION
    cfg.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = WATCH_DEPLOY
    cfg.build_settings['TARGETED_DEVICE_FAMILY']    = '4'
    cfg.build_settings['SDKROOT']                   = 'watchos'
    cfg.build_settings['SUPPORTED_PLATFORMS']       = 'watchos watchsimulator'
    cfg.build_settings['LD_RUNPATH_SEARCH_PATHS']   = ['$(inherited)', '@executable_path/Frameworks']
  end

  # Source group
  watch_group = project.main_group.new_group(WATCH_TARGET_NAME, WATCH_TARGET_NAME)
  %w[WatchApp.swift ContentView.swift WatchSessionManager.swift].each do |f|
    add_source(project, watch_group, watch_target, File.join(watch_dir, f))
  end

  # WatchConnectivity framework
  add_framework(project, watch_target, 'WatchConnectivity')

  # App Groups entitlements
  ent_path = File.join(watch_dir, "#{WATCH_TARGET_NAME}.entitlements")
  write_entitlements(ent_path, APP_GROUP)
  watch_target.build_configurations.each do |cfg|
    cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] =
      "#{WATCH_TARGET_NAME}/#{WATCH_TARGET_NAME}.entitlements"
  end

  puts "  Created target: #{WATCH_TARGET_NAME}"
else
  puts "  Target already exists: #{WATCH_TARGET_NAME}"
end

# ════════════════════════════════════════════════════════════════════════════════
puts "\n[3/4] Creating Widget Extension target..."
# ════════════════════════════════════════════════════════════════════════════════
WIDGET_TARGET_NAME = 'UltimatePlaybackWidget'
WIDGET_BUNDLE_ID   = "#{BUNDLE_ID}.widget"
WIDGET_DEPLOY      = '14.0'

widget_dir = File.join(IOS_DIR, WIDGET_TARGET_NAME)
FileUtils.mkdir_p(widget_dir)

# Copy Widget Swift sources
%w[WidgetEntry.swift UltimateWidget.swift].each do |f|
  src  = File.join(NATIVE_DIR, 'Widget', f)
  dest = File.join(widget_dir, f)
  FileUtils.cp(src, dest) unless File.exist?(dest)
end

# Widget needs an Info.plist
widget_info_path = File.join(widget_dir, 'Info.plist')
unless File.exist?(widget_info_path)
  Xcodeproj::Plist.write_to_path({
    'NSExtension' => {
      'NSExtensionPointIdentifier' => 'com.apple.widgetkit-extension'
    }
  }, widget_info_path)
end

unless find_target(project, WIDGET_TARGET_NAME)
  widget_target = project.new_target(
    :app_extension,
    WIDGET_TARGET_NAME,
    :ios,
    WIDGET_DEPLOY
  )

  widget_target.build_configurations.each do |cfg|
    cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER']   = WIDGET_BUNDLE_ID
    cfg.build_settings['SWIFT_VERSION']               = SWIFT_VERSION
    cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET']  = WIDGET_DEPLOY
    cfg.build_settings['INFOPLIST_FILE']              =
      "#{WIDGET_TARGET_NAME}/Info.plist"
    cfg.build_settings['LD_RUNPATH_SEARCH_PATHS']     =
      ['$(inherited)', '@executable_path/../../Frameworks']
  end

  widget_group = project.main_group.new_group(WIDGET_TARGET_NAME, WIDGET_TARGET_NAME)
  %w[WidgetEntry.swift UltimateWidget.swift].each do |f|
    add_source(project, widget_group, widget_target, File.join(widget_dir, f))
  end

  # Add WidgetKit framework
  add_framework(project, widget_target, 'WidgetKit')
  add_framework(project, widget_target, 'SwiftUI')

  # App Groups entitlements
  ent_path = File.join(widget_dir, "#{WIDGET_TARGET_NAME}.entitlements")
  write_entitlements(ent_path, APP_GROUP)
  widget_target.build_configurations.each do |cfg|
    cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] =
      "#{WIDGET_TARGET_NAME}/#{WIDGET_TARGET_NAME}.entitlements"
  end

  puts "  Created target: #{WIDGET_TARGET_NAME}"
else
  puts "  Target already exists: #{WIDGET_TARGET_NAME}"
end

# ════════════════════════════════════════════════════════════════════════════════
puts "\n[4/4] Saving project..."
# ════════════════════════════════════════════════════════════════════════════════
project.save
puts "  Saved: #{XCODEPROJ}"

puts "\n✅ Done! Open Xcode:"
puts "   open ios/UltimatePlayback.xcworkspace"
puts ""
puts "Then:"
puts "  1. Select each new target → Signing & Capabilities → set your Team"
puts "  2. Build on a physical iPhone (WatchConnectivity needs real hardware)"
