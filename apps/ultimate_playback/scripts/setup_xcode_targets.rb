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
require 'json'

PROJECT_ROOT  = File.expand_path('..', __dir__)
IOS_DIR       = File.join(PROJECT_ROOT, 'ios')
XCODEPROJ     = File.join(IOS_DIR, 'UltimatePlayback.xcodeproj')
APP_TARGET    = 'UltimatePlayback'
BUNDLE_ID     = 'com.ultimatemusician.playback'
APP_GROUP     = 'group.com.ultimatemusician.playback'
NATIVE_DIR    = File.join(PROJECT_ROOT, 'native')
SWIFT_VERSION = '5.0'
APP_CONFIG    = JSON.parse(File.read(File.join(PROJECT_ROOT, 'app.json')))
APP_VERSION   = APP_CONFIG.dig('expo', 'version') || '1.0'
APP_BUILD     = APP_CONFIG.dig('expo', 'ios', 'buildNumber') || '1'

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
  ref = group.files.find { |f| f.display_name == display_name }
  unless ref
    ref = group.new_reference(file_path)
    ref.name = display_name
    ref.source_tree = '<group>'
  end
  return if target.source_build_phase.files_references.include?(ref)
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

def write_widget_info_plist(path)
  Xcodeproj::Plist.write_to_path({
    'CFBundleDevelopmentRegion' => '$(DEVELOPMENT_LANGUAGE)',
    'CFBundleDisplayName' => 'Ultimate Playback',
    'CFBundleExecutable' => '$(EXECUTABLE_NAME)',
    'CFBundleIdentifier' => '$(PRODUCT_BUNDLE_IDENTIFIER)',
    'CFBundleInfoDictionaryVersion' => '6.0',
    'CFBundleName' => '$(PRODUCT_NAME)',
    'CFBundlePackageType' => '$(PRODUCT_BUNDLE_PACKAGE_TYPE)',
    'CFBundleShortVersionString' => '$(MARKETING_VERSION)',
    'CFBundleVersion' => '$(CURRENT_PROJECT_VERSION)',
    'NSExtension' => {
      'NSExtensionPointIdentifier' => 'com.apple.widgetkit-extension'
    },
  }, path)
  puts "  ~ widget Info.plist"
end

# ── Helper: add framework to a target ────────────────────────────────────────
def add_framework(project, target, framework_name)
  # Use a platform-relative path so it works for both iOS and watchOS targets
  ref = project.frameworks_group.files.find { |f| f.path == "System/Library/Frameworks/#{framework_name}.framework" }
  unless ref
    ref = project.frameworks_group.new_reference("System/Library/Frameworks/#{framework_name}.framework")
    ref.source_tree = 'SDKROOT'
    ref.last_known_file_type = 'wrapper.framework'
    ref.name = "#{framework_name}.framework"
  end
  phase = target.frameworks_build_phase
  return if phase.files.any? { |f| f.display_name == "#{framework_name}.framework" }
  phase.add_file_reference(ref)
  puts "  + #{framework_name}.framework"
end

def ensure_target_dependency(target, dependency_target)
  return if target.dependencies.any? { |dep| dep.target == dependency_target }
  target.add_dependency(dependency_target)
  puts "  + dependency: #{dependency_target.name}"
end

def ensure_copy_phase(target, name, destination:, dst_path: '')
  phase = target.copy_files_build_phases.find { |bp| bp.name == name } ||
          target.new_copy_files_build_phase(name)
  phase.symbol_dst_subfolder_spec = destination
  phase.dst_path = dst_path
  phase
end

def ensure_embedded_product(target, phase, product_ref, attributes: nil)
  build_file = phase.files.find { |f| f.file_ref == product_ref } ||
               phase.add_file_reference(product_ref, true)
  build_file.settings = { 'ATTRIBUTES' => attributes } if attributes
  puts "  + embed: #{product_ref.path}"
end

def ensure_product_reference(target, name, path)
  return unless target.product_reference
  target.product_reference.name = name
  target.product_reference.path = path
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

watch_target = find_target(project, WATCH_TARGET_NAME)
unless watch_target
  watch_target = project.new_target(
    :application,
    WATCH_TARGET_NAME,
    :watchos,
    WATCH_DEPLOY
  )
  puts "  Created target: #{WATCH_TARGET_NAME}"
else
  puts "  Target already exists: #{WATCH_TARGET_NAME}"
end

ensure_product_reference(watch_target, "#{WATCH_TARGET_NAME}.app", "#{WATCH_TARGET_NAME}.app")

# Build settings
watch_target.build_configurations.each do |cfg|
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = WATCH_BUNDLE_ID
  cfg.build_settings['PRODUCT_NAME']              = WATCH_TARGET_NAME
  cfg.build_settings['SWIFT_VERSION']             = SWIFT_VERSION
  cfg.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = WATCH_DEPLOY
  cfg.build_settings['TARGETED_DEVICE_FAMILY']    = '4'
  cfg.build_settings['SDKROOT']                   = 'watchos'
  cfg.build_settings['SUPPORTED_PLATFORMS']       = 'watchos watchsimulator'
  cfg.build_settings['LD_RUNPATH_SEARCH_PATHS']   = ['$(inherited)', '@executable_path/Frameworks']
  cfg.build_settings['GENERATE_INFOPLIST_FILE']   = 'YES'
  cfg.build_settings['INFOPLIST_KEY_CFBundleDisplayName'] = 'Ultimate Playback'
  cfg.build_settings['INFOPLIST_KEY_WKCompanionAppBundleIdentifier'] = BUNDLE_ID
  cfg.build_settings['MARKETING_VERSION']         = APP_VERSION
  cfg.build_settings['CURRENT_PROJECT_VERSION']   = APP_BUILD
  cfg.build_settings['SKIP_INSTALL']              = 'YES'
end

# Source group
watch_group = project.main_group.find_subpath(WATCH_TARGET_NAME) ||
              project.main_group.new_group(WATCH_TARGET_NAME, WATCH_TARGET_NAME)
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
write_widget_info_plist(widget_info_path)

widget_target = find_target(project, WIDGET_TARGET_NAME)
unless widget_target
  widget_target = project.new_target(
    :app_extension,
    WIDGET_TARGET_NAME,
    :ios,
    WIDGET_DEPLOY
  )
  puts "  Created target: #{WIDGET_TARGET_NAME}"
else
  puts "  Target already exists: #{WIDGET_TARGET_NAME}"
end

ensure_product_reference(widget_target, "#{WIDGET_TARGET_NAME}.appex", "#{WIDGET_TARGET_NAME}.appex")

widget_target.build_configurations.each do |cfg|
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER']   = WIDGET_BUNDLE_ID
  cfg.build_settings['PRODUCT_NAME']                = WIDGET_TARGET_NAME
  cfg.build_settings['SWIFT_VERSION']               = SWIFT_VERSION
  cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET']  = WIDGET_DEPLOY
  cfg.build_settings['INFOPLIST_FILE']              =
    "#{WIDGET_TARGET_NAME}/Info.plist"
  cfg.build_settings['LD_RUNPATH_SEARCH_PATHS']     =
    ['$(inherited)', '@executable_path/../../Frameworks']
  cfg.build_settings['MARKETING_VERSION']           = APP_VERSION
  cfg.build_settings['CURRENT_PROJECT_VERSION']     = APP_BUILD
  cfg.build_settings['SKIP_INSTALL']                = 'YES'
end

widget_group = project.main_group.find_subpath(WIDGET_TARGET_NAME) ||
               project.main_group.new_group(WIDGET_TARGET_NAME, WIDGET_TARGET_NAME)
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

# Ensure main app embeds widget + watch and depends on both targets
ensure_target_dependency(app_target, widget_target)
ensure_target_dependency(app_target, watch_target)

app_extension_phase = ensure_copy_phase(
  app_target,
  'Embed App Extensions',
  destination: :plug_ins,
  dst_path: ''
)
ensure_embedded_product(
  app_target,
  app_extension_phase,
  widget_target.product_reference,
  attributes: ['RemoveHeadersOnCopy']
)

watch_content_phase = ensure_copy_phase(
  app_target,
  'Embed Watch Content',
  destination: :products_directory,
  dst_path: '$(CONTENTS_FOLDER_PATH)/Watch'
)
ensure_embedded_product(app_target, watch_content_phase, watch_target.product_reference)

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
