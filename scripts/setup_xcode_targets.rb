#!/usr/bin/env ruby
# setup_xcode_targets.rb
# Uses the xcodeproj gem to:
#   1. Add WatchBridgeModule + WidgetDataModule source files to the iOS app target
#   2. Create the WatchKit App stub target
#   3. Create the WatchKit Extension target + copy Watch Swift files
#   4. Create the Widget Extension target + copy Widget Swift files
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
ICON_SOURCE   = File.join(PROJECT_ROOT, 'assets', 'icon.png')
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

def add_resource(group, target, file_path, display_name = nil)
  display_name ||= File.basename(file_path)
  ref = group.children.find { |child| child.display_name == display_name }
  unless ref
    ref = group.new_reference(file_path)
    ref.name = display_name
    ref.source_tree = '<group>'
  end
  return if target.resources_build_phase.files_references.include?(ref)
  target.resources_build_phase.add_file_reference(ref)
  puts "  + resource: #{display_name}"
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

def remove_phase_if_present(target, phase)
  return unless phase
  target.build_phases.delete(phase)
  phase.remove_from_project
end

def remove_illegal_watch_phases(target)
  target.build_phases.dup.each do |phase|
    next unless %w[PBXSourcesBuildPhase PBXFrameworksBuildPhase].include?(phase.isa)

    phase.files.dup.each(&:remove_from_project)
    target.build_phases.delete(phase)
    phase.remove_from_project
  end
end

def write_watch_extension_info_plist(path, watch_bundle_id)
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
      'NSExtensionAttributes' => {
        'WKAppBundleIdentifier' => watch_bundle_id,
      },
      'NSExtensionPointIdentifier' => 'com.apple.watchkit',
    },
  }, path)
  puts "  ~ watch extension Info.plist"
end

WATCH_ICON_VARIANTS = [
  {
    filename: 'AppIcon24x24@2x.png',
    pixels: 48,
    size: '24x24',
    scale: '2x',
    role: 'notificationCenter',
    subtype: '38mm',
  },
  {
    filename: 'AppIcon27.5x27.5@2x.png',
    pixels: 55,
    size: '27.5x27.5',
    scale: '2x',
    role: 'notificationCenter',
    subtype: '42mm',
  },
  {
    filename: 'AppIcon29x29@2x.png',
    pixels: 58,
    size: '29x29',
    scale: '2x',
    role: 'companionSettings',
  },
  {
    filename: 'AppIcon29x29@3x.png',
    pixels: 87,
    size: '29x29',
    scale: '3x',
    role: 'companionSettings',
  },
  {
    filename: 'AppIcon40x40@2x.png',
    pixels: 80,
    size: '40x40',
    scale: '2x',
    role: 'appLauncher',
  },
  {
    filename: 'AppIcon40x40@2x.png',
    pixels: 80,
    size: '40x40',
    scale: '2x',
    role: 'longLook',
    subtype: '38mm',
  },
  {
    filename: 'AppIcon44x44@2x.png',
    pixels: 88,
    size: '44x44',
    scale: '2x',
    role: 'longLook',
    subtype: '42mm',
  },
  {
    filename: 'AppIcon86x86@2x.png',
    pixels: 172,
    size: '86x86',
    scale: '2x',
    role: 'quickLook',
    subtype: '38mm',
  },
  {
    filename: 'AppIcon98x98@2x.png',
    pixels: 196,
    size: '98x98',
    scale: '2x',
    role: 'quickLook',
    subtype: '42mm',
  },
  {
    filename: 'AppIcon1024x1024.png',
    pixels: 1024,
    size: '1024x1024',
    scale: '1x',
    idiom: 'watch-marketing',
  },
].freeze

def write_watch_app_info_plist(path)
  icon_files = WATCH_ICON_VARIANTS
    .map { |variant| File.basename(variant[:filename], '.png') }
    .uniq
    .reject { |name| name == 'AppIcon1024x1024' }

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
    'CFBundleIconName' => 'AppIcon',
    'CFBundleIconFiles' => icon_files,
    'CFBundleIcons' => {
      'CFBundlePrimaryIcon' => {
        'CFBundleIconFiles' => icon_files,
        'CFBundleIconName' => 'AppIcon',
      },
    },
    'WKCompanionAppBundleIdentifier' => BUNDLE_ID,
    'WKWatchKitApp' => true,
  }, path)
  puts "  ~ watch app Info.plist"
end

def ensure_watch_asset_catalog(watch_dir)
  abort "Watch icon source not found at #{ICON_SOURCE}" unless File.exist?(ICON_SOURCE)

  asset_catalog_dir = File.join(watch_dir, 'Assets.xcassets')
  accent_color_dir = File.join(asset_catalog_dir, 'AccentColor.colorset')
  app_icon_dir = File.join(asset_catalog_dir, 'AppIcon.appiconset')

  FileUtils.mkdir_p(accent_color_dir)
  FileUtils.mkdir_p(app_icon_dir)

  File.write(
    File.join(asset_catalog_dir, 'Contents.json'),
    JSON.pretty_generate({
      info: {
        author: 'xcode',
        version: 1,
      },
    }) + "\n"
  )

  File.write(
    File.join(accent_color_dir, 'Contents.json'),
    JSON.pretty_generate({
      colors: [
        {
          idiom: 'universal',
        },
      ],
      info: {
        author: 'xcode',
        version: 1,
      },
    }) + "\n"
  )

  watch_icon_images = WATCH_ICON_VARIANTS.map do |variant|
    destination = File.join(app_icon_dir, variant[:filename])
    success = system(
      'sips',
      '-z',
      variant[:pixels].to_s,
      variant[:pixels].to_s,
      ICON_SOURCE,
      '--out',
      destination,
      out: File::NULL,
      err: File::NULL
    )
    abort "Failed to generate watch icon #{variant[:filename]}" unless success

    image = {
      filename: variant[:filename],
      idiom: variant.fetch(:idiom, 'watch'),
      scale: variant[:scale],
      size: variant[:size],
    }
    image[:role] = variant[:role] if variant[:role]
    image[:subtype] = variant[:subtype] if variant[:subtype]
    image
  end

  File.write(
    File.join(app_icon_dir, 'Contents.json'),
    JSON.pretty_generate({
      images: watch_icon_images,
      info: {
        author: 'xcode',
        version: 1,
      },
    }) + "\n"
  )

  puts "  ~ watch app icon assets"
  asset_catalog_dir
end

# ════════════════════════════════════════════════════════════════════════════════
puts "\n[1/4] Adding native RN modules to iOS app target..."
# ════════════════════════════════════════════════════════════════════════════════
app_target   = find_target(project, APP_TARGET)
abort "Target '#{APP_TARGET}' not found!" unless app_target
app_team_id  = app_target.build_configurations
  .map { |cfg| cfg.build_settings['DEVELOPMENT_TEAM'] }
  .compact
  .find { |value| !value.to_s.empty? } || 'QK35B74FL3'

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

# Keep the main app target versioning aligned with app.json so
# embedded watch/widget builds can safely match the parent app.
app_target.build_configurations.each do |cfg|
  cfg.build_settings['DEVELOPMENT_TEAM']         = app_team_id
  cfg.build_settings['CODE_SIGN_STYLE']          = 'Automatic'
  cfg.build_settings['MARKETING_VERSION']       = APP_VERSION
  cfg.build_settings['CURRENT_PROJECT_VERSION'] = APP_BUILD
end

# Add WatchConnectivity to iOS app target
add_framework(project, app_target, 'WatchConnectivity')

# ════════════════════════════════════════════════════════════════════════════════
puts "\n[2/4] Creating Watch App target..."
# ════════════════════════════════════════════════════════════════════════════════
WATCH_TARGET_NAME = 'UltimatePlaybackWatch'
WATCH_BUNDLE_ID   = "#{BUNDLE_ID}.watchkitapp"
WATCH_EXTENSION_TARGET_NAME = 'UltimatePlaybackWatchExtension'
WATCH_EXTENSION_BUNDLE_ID   = "#{WATCH_BUNDLE_ID}.watchkitextension"
WATCH_DEPLOY      = '7.0'

watch_dir = File.join(IOS_DIR, WATCH_TARGET_NAME)
FileUtils.mkdir_p(watch_dir)
watch_info_path = File.join(watch_dir, 'Info.plist')
write_watch_app_info_plist(watch_info_path)
watch_assets_dir = ensure_watch_asset_catalog(watch_dir)

watch_target = find_target(project, WATCH_TARGET_NAME)
unless watch_target
  watch_target = project.new_target(
    :watch2_app,
    WATCH_TARGET_NAME,
    :watchos,
    WATCH_DEPLOY
  )
  puts "  Created target: #{WATCH_TARGET_NAME}"
else
  puts "  Target already exists: #{WATCH_TARGET_NAME}"
end
watch_target.product_type = Xcodeproj::Constants::PRODUCT_TYPE_UTI[:watch2_app]
remove_illegal_watch_phases(watch_target)

ensure_product_reference(watch_target, "#{WATCH_TARGET_NAME}.app", "#{WATCH_TARGET_NAME}.app")

# Build settings
watch_target.build_configurations.each do |cfg|
  cfg.build_settings['DEVELOPMENT_TEAM']         = app_team_id
  cfg.build_settings['CODE_SIGN_STYLE']          = 'Automatic'
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = WATCH_BUNDLE_ID
  cfg.build_settings['PRODUCT_NAME']              = WATCH_TARGET_NAME
  cfg.build_settings['SWIFT_VERSION']             = SWIFT_VERSION
  cfg.build_settings['WATCHOS_DEPLOYMENT_TARGET'] = WATCH_DEPLOY
  cfg.build_settings['TARGETED_DEVICE_FAMILY']    = '4'
  cfg.build_settings['SDKROOT']                   = 'watchos'
  cfg.build_settings['SUPPORTED_PLATFORMS']       = 'watchos watchsimulator'
  cfg.build_settings['GENERATE_INFOPLIST_FILE']   = 'NO'
  cfg.build_settings['INFOPLIST_FILE']            = "#{WATCH_TARGET_NAME}/Info.plist"
  cfg.build_settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = 'AppIcon'
  cfg.build_settings['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
  cfg.build_settings['MARKETING_VERSION']         = APP_VERSION
  cfg.build_settings['CURRENT_PROJECT_VERSION']   = APP_BUILD
  cfg.build_settings['SKIP_INSTALL']              = 'YES'
end

# Source/resources group
watch_group = project.main_group.find_subpath(WATCH_TARGET_NAME) ||
              project.main_group.new_group(WATCH_TARGET_NAME, WATCH_TARGET_NAME)
add_resource(watch_group, watch_target, watch_assets_dir, 'Assets.xcassets')

# App Groups entitlements
ent_path = File.join(watch_dir, "#{WATCH_TARGET_NAME}.entitlements")
write_entitlements(ent_path, APP_GROUP)
watch_target.build_configurations.each do |cfg|
  cfg.build_settings['CODE_SIGN_ENTITLEMENTS'] =
    "#{WATCH_TARGET_NAME}/#{WATCH_TARGET_NAME}.entitlements"
end

# ════════════════════════════════════════════════════════════════════════════════
puts "\n[3/4] Creating Watch Extension target..."
# ════════════════════════════════════════════════════════════════════════════════
watch_extension_dir = File.join(IOS_DIR, WATCH_EXTENSION_TARGET_NAME)
FileUtils.mkdir_p(watch_extension_dir)

%w[WatchApp.swift ContentView.swift WatchSessionManager.swift].each do |f|
  src  = File.join(NATIVE_DIR, 'Watch', f)
  dest = File.join(watch_extension_dir, f)
  FileUtils.cp(src, dest) unless File.exist?(dest)
end

watch_extension_info_path = File.join(watch_extension_dir, 'Info.plist')
write_watch_extension_info_plist(watch_extension_info_path, WATCH_BUNDLE_ID)

watch_extension_target = find_target(project, WATCH_EXTENSION_TARGET_NAME)
unless watch_extension_target
  watch_extension_target = project.new_target(
    :watch2_extension,
    WATCH_EXTENSION_TARGET_NAME,
    :watchos,
    WATCH_DEPLOY
  )
  puts "  Created target: #{WATCH_EXTENSION_TARGET_NAME}"
else
  puts "  Target already exists: #{WATCH_EXTENSION_TARGET_NAME}"
end

watch_extension_target.product_type = Xcodeproj::Constants::PRODUCT_TYPE_UTI[:watch2_extension]
ensure_product_reference(
  watch_extension_target,
  "#{WATCH_EXTENSION_TARGET_NAME}.appex",
  "#{WATCH_EXTENSION_TARGET_NAME}.appex"
)

watch_extension_target.build_configurations.each do |cfg|
  cfg.build_settings['DEVELOPMENT_TEAM']            = app_team_id
  cfg.build_settings['CODE_SIGN_STYLE']             = 'Automatic'
  cfg.build_settings['PRODUCT_BUNDLE_IDENTIFIER']   = WATCH_EXTENSION_BUNDLE_ID
  cfg.build_settings['PRODUCT_NAME']                = WATCH_EXTENSION_TARGET_NAME
  cfg.build_settings['SWIFT_VERSION']               = SWIFT_VERSION
  cfg.build_settings['WATCHOS_DEPLOYMENT_TARGET']   = WATCH_DEPLOY
  cfg.build_settings['TARGETED_DEVICE_FAMILY']      = '4'
  cfg.build_settings['SDKROOT']                     = 'watchos'
  cfg.build_settings['SUPPORTED_PLATFORMS']         = 'watchos watchsimulator'
  cfg.build_settings['INFOPLIST_FILE']              =
    "#{WATCH_EXTENSION_TARGET_NAME}/Info.plist"
  cfg.build_settings['LD_RUNPATH_SEARCH_PATHS']     = [
    '$(inherited)',
    '@executable_path/Frameworks',
    '@executable_path/../../Frameworks',
    '@executable_path/../../../../Frameworks',
  ]
  cfg.build_settings['MARKETING_VERSION']           = APP_VERSION
  cfg.build_settings['CURRENT_PROJECT_VERSION']     = APP_BUILD
  cfg.build_settings['SKIP_INSTALL']                = 'YES'
  cfg.build_settings.delete('CODE_SIGN_ENTITLEMENTS')
end

watch_extension_group = project.main_group.find_subpath(WATCH_EXTENSION_TARGET_NAME) ||
                        project.main_group.new_group(
                          WATCH_EXTENSION_TARGET_NAME,
                          WATCH_EXTENSION_TARGET_NAME
                        )
%w[WatchApp.swift ContentView.swift WatchSessionManager.swift].each do |f|
  add_source(
    project,
    watch_extension_group,
    watch_extension_target,
    File.join(watch_extension_dir, f)
  )
end

add_framework(project, watch_extension_target, 'WatchConnectivity')
add_framework(project, watch_extension_target, 'SwiftUI')

ensure_target_dependency(watch_target, watch_extension_target)
watch_app_extension_phase = ensure_copy_phase(
  watch_target,
  'Embed App Extensions',
  destination: :plug_ins,
  dst_path: ''
)
ensure_embedded_product(
  watch_target,
  watch_app_extension_phase,
  watch_extension_target.product_reference,
  attributes: ['RemoveHeadersOnCopy']
)

# ════════════════════════════════════════════════════════════════════════════════
puts "\n[4/5] Creating Widget Extension target..."
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
  cfg.build_settings['DEVELOPMENT_TEAM']         = app_team_id
  cfg.build_settings['CODE_SIGN_STYLE']          = 'Automatic'
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
puts "\n[5/5] Saving project..."
# ════════════════════════════════════════════════════════════════════════════════
project.save
puts "  Saved: #{XCODEPROJ}"

puts "\n✅ Done! Open Xcode:"
puts "   open ios/UltimatePlayback.xcworkspace"
puts ""
puts "Then:"
puts "  1. Select each new target → Signing & Capabilities → set your Team"
puts "  2. Build on a physical iPhone (WatchConnectivity needs real hardware)"
