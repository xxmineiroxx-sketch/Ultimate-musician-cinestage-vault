import React, { useRef, useEffect, Component } from 'react';
import { LogBox, Platform, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

class ErrorBoundary extends Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={eb.wrap}>
        <Text style={eb.title}>Something went wrong</Text>
        <Text style={eb.msg}>{String(this.state.error?.message || '')}</Text>
        <TouchableOpacity style={eb.btn} onPress={() => this.setState({ hasError: false, error: null })}>
          <Text style={eb.btnTxt}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
const eb = StyleSheet.create({
  wrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020617', padding: 32 },
  title: { color: '#EF4444', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  msg:   { color: '#94A3B8', fontSize: 14, textAlign: 'center', marginBottom: 24 },
  btn:   { backgroundColor: '#4F46E5', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 8 },
  btnTxt:{ color: '#fff', fontWeight: '700' },
});
import * as Notifications from 'expo-notifications';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import MessageNotificationWatcher from './components/MessageNotificationWatcher';

LogBox.ignoreLogs([
  'Could not access feature flag',
  'disableEventLoopOnBridgeless',
  'newArchEnabled',
]);

const _origError = console.error;
console.error = (...args) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('disableEventLoopOnBridgeless') || msg.includes('feature flag')) return;
  _origError(...args);
};

// Show banners + play sound for push notifications received while app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// ── Auth ─────────────────────────────────────────────────────────────────────
import LandingScreen          from './screens/LandingScreen';
import LoginScreen            from './screens/LoginScreen';
import RegisterScreen         from './screens/RegisterScreen';
import VerifyScreen           from './screens/VerifyScreen';

// ── Core ─────────────────────────────────────────────────────────────────────
import HomeScreen             from './screens/HomeScreen';
import LibraryScreen          from './screens/LibraryScreen';
import NewSongScreen          from './screens/NewSongScreen';
import SongDetailScreen       from './screens/SongDetailScreen';
import ProfileScreen          from './screens/ProfileScreen';
import SettingsScreen         from './screens/SettingsScreen';

// ── Planning ─────────────────────────────────────────────────────────────────
import PlanningScreen         from './screens/PlanningScreen';
import PlanningCenterScreen   from './screens/PlanningCenterScreen';
import NewServiceScreen       from './screens/NewServiceScreen';
import ServicePlanScreen      from './screens/ServicePlanScreen';
import ServiceFeedbackScreen  from './screens/ServiceFeedbackScreen';
import SongPlanDetailScreen   from './screens/SongPlanDetailScreen';
import SetlistScreen          from './screens/SetlistScreen';
import CalendarScreen         from './screens/CalendarScreen';
import ChecklistScreen        from './screens/ChecklistScreen';
import BlockoutCalendarScreen from './screens/BlockoutCalendarScreen';
import ProposalsScreen        from './screens/ProposalsScreen';
import AvailabilityHeatmapScreen from './screens/AvailabilityHeatmapScreen';

// ── People ────────────────────────────────────────────────────────────────────
import PeopleRolesScreen      from './screens/PeopleRolesScreen';
import PersonProfileScreen    from './screens/PersonProfileScreen';
import RoleSelectScreen       from './screens/RoleSelectScreen';
import PermissionsScreen      from './screens/PermissionsScreen';
import OrganizationScreen     from './screens/OrganizationScreen';
import MessageCenterScreen    from './screens/MessageCenterScreen';

// ── Performance / Audio ───────────────────────────────────────────────────────
import MixerScreen            from './screens/MixerScreen';
import MixerConsoleScreen     from './screens/MixerConsoleScreen';
import LiveScreen             from './screens/LiveScreen';
import LiveModeScreen         from './screens/LiveModeScreen';
import RehearsalScreen        from './screens/RehearsalScreen';
import PerformanceScreen      from './screens/PerformanceScreen';
import StemsCenterScreen      from './screens/StemsCenterScreen';
import StemMixerScreen        from './screens/StemMixerScreen';
import StudioScreen           from './screens/StudioScreen';
import WaveformDetailScreen   from './screens/WaveformDetailScreen';
import StageDisplayScreen     from './screens/StageDisplayScreen';
import DronePadScreen         from './screens/DronePadScreen';
import KeyChangeScreen        from './screens/KeyChangeScreen';
import PartSheetScreen        from './screens/PartSheetScreen';
import SectionMappingScreen   from './screens/SectionMappingScreen';
import SongMapScreen          from './screens/SongMapScreen';

// ── Presets / Fat Channel ─────────────────────────────────────────────────────
import PresetsScreen              from './screens/PresetsScreen';
import FatChannelPresetsScreen    from './screens/FatChannelPresetsScreen';
import PresetEditorScreen         from './screens/PresetEditorScreen';
import PresetLibraryBrowserScreen from './screens/PresetLibraryBrowserScreen';

// ── CineStage ─────────────────────────────────────────────────────────────────
import CineStageScreen          from './screens/CineStageScreen';
import CineStageDashboardScreen from './screens/CineStageDashboardScreen';
import BridgeSetupScreen        from './screens/BridgeSetupScreen';
import ExternalSyncScreen       from './screens/ExternalSyncScreen';
import CueGridScreen            from './screens/CueGridScreen';
import MusicDirectorRemoteScreen from './screens/MusicDirectorRemoteScreen';

// ── System / Utility ──────────────────────────────────────────────────────────
import DeviceRoleScreen       from './screens/DeviceRoleScreen';
import DeviceSetupScreen      from './screens/DeviceSetupScreen';
import BranchManagerScreen    from './screens/BranchManagerScreen';
import BranchSetupScreen      from './screens/BranchSetupScreen';
import CentralAdminScreen     from './screens/CentralAdminScreen';
import OnboardingSystemMap    from './screens/OnboardingSystemMap';
import SystemMapScreen        from './screens/SystemMapScreen';
import DiagnosticsScreen      from './screens/DiagnosticsScreen';
import TestModeScreen         from './screens/TestModeScreen';
import SuggestFeatureScreen   from './screens/SuggestFeatureScreen';
import OrganizerScreen        from './screens/OrganizerScreen';
import PCOImportScreen        from './screens/PCOImportScreen';
import PCOIntegrationScreen   from './screens/PCOIntegrationScreen';
import PlanTeamScreen         from './screens/PlanTeamScreen';
import LiveServiceScreen      from './screens/LiveServiceScreen';
import BillingScreen          from './screens/BillingScreen';
import AnalyticsDashboardScreen from './screens/AnalyticsDashboardScreen';
import NotificationPrefsScreen from './screens/NotificationPrefsScreen';
import WebhooksScreen          from './screens/WebhooksScreen';

const Stack = createNativeStackNavigator();
const linking = {
  prefixes: ['co.ultimatelabs.musician://', 'exp+studio://'],
  config: {
    screens: {
      Landing: 'landing',
      Login: 'login',
      Register: 'register',
      Verify: 'verify',
      Home: 'home',
      Library: 'library',
      NewSong: 'new-song',
      SongDetail: {
        path: 'song/:songId?',
        parse: {
          songId: (value) => String(value || '').trim(),
        },
      },
      Planning: 'planning',
      PeopleRoles: 'people-roles',
      Rehearsal: {
        path: 'rehearsal/:songId?',
        parse: {
          songId: (value) => String(value || '').trim(),
        },
      },
      MixerConsole: {
        path: 'mixer-console/:songId?',
        parse: {
          songId: (value) => String(value || '').trim(),
        },
      },
      PartSheet: {
        path: 'part-sheet/:songId?',
        parse: {
          songId: (value) => String(value || '').trim(),
        },
      },
      CineStage: {
        path: 'cinestage/:songId?',
        parse: {
          songId: (value) => String(value || '').trim(),
        },
      },
    },
  },
};

/** Navigate from a push notification payload to the right screen. */
function handleNotificationNavigation(navRef, data = {}) {
  if (!navRef?.current) return;
  const { type, serviceId } = data;
  try {
    if (type === 'assignment' || type === 'reminder') {
      navRef.current.navigate(serviceId ? 'ServicePlan' : 'PlanningCenter', serviceId ? { serviceId } : {});
    } else if (type === 'assignment_response') {
      navRef.current.navigate(serviceId ? 'ServicePlan' : 'PlanningCenter', serviceId ? { serviceId } : {});
    } else if (type === 'message') {
      navRef.current.navigate('MessageCenter');
    } else {
      navRef.current.navigate('Home');
    }
  } catch (_) {}
}

// Sits inside ThemeProvider so it can call useTheme()
function ThemedNavigator({ navigationRef }) {
  const theme = useTheme();
  const isDark = theme?.isDark ?? true;
  const colors = theme?.colors ?? {};
  const bg   = colors.background || (isDark ? '#020617' : '#F8FAFC');
  const card = colors.card       || (isDark ? '#0B1220' : '#FFFFFF');
  const text = colors.text       || (isDark ? '#E5E7EB' : '#0F172A');
  // Use screenOptions for header theming — avoids React Navigation's ThemeContext entirely
  const HDR = {
    headerStyle: { backgroundColor: card },
    headerTintColor: text,
    headerTitleStyle: { fontWeight: '700' },
    contentStyle: { backgroundColor: bg },
  };
  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
      <Stack.Navigator initialRouteName="Landing" screenOptions={HDR}>

        {/* Auth */}
        <Stack.Screen name="Landing"  component={LandingScreen}  options={{ headerShown: false }} />
        <Stack.Screen name="Login"    component={LoginScreen}    options={{ headerShown: false }} />
        <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Verify"   component={VerifyScreen}   options={{ headerShown: false }} />

        {/* Core */}
        <Stack.Screen name="Home"       component={HomeScreen}       options={{ headerShown: false }} />
        <Stack.Screen name="Library"    component={LibraryScreen}    options={{ title: 'Songs' }} />
        <Stack.Screen name="NewSong"    component={NewSongScreen}    options={{ title: 'Add Song' }} />
        <Stack.Screen name="SongDetail" component={SongDetailScreen} options={{ title: 'Song Details' }} />
        <Stack.Screen name="Profile"    component={ProfileScreen}    options={{ title: 'Profile' }} />
        <Stack.Screen name="Settings"   component={SettingsScreen}   options={{ title: 'Settings' }} />

        {/* Planning */}
        <Stack.Screen name="Planning"            component={PlanningScreen}            options={{ title: 'Planning' }} />
        <Stack.Screen name="PlanningCenter"      component={PlanningCenterScreen}      options={{ title: 'Planning Center' }} />
        <Stack.Screen name="PCOImport"           component={PCOImportScreen}           options={{ title: 'PCO Import' }} />
        <Stack.Screen name="PCOIntegration"      component={PCOIntegrationScreen}      options={{ title: 'Planning Center' }} />
        <Stack.Screen name="NewService"          component={NewServiceScreen}          options={{ title: 'New Service' }} />
        <Stack.Screen name="ServicePlan"         component={ServicePlanScreen}         options={{ title: 'Service Plan' }} />
        <Stack.Screen name="ServiceFeedback"     component={ServiceFeedbackScreen}     options={{ title: 'Service Feedback' }} />
        <Stack.Screen name="SongPlanDetail"      component={SongPlanDetailScreen}      options={{ title: 'Song Plan' }} />
        <Stack.Screen name="Setlist"             component={SetlistScreen}             options={{ title: 'Setlist' }} />
        <Stack.Screen name="Calendar"            component={CalendarScreen}            options={{ title: 'Calendar' }} />
        <Stack.Screen name="Checklist"           component={ChecklistScreen}           options={{ title: 'Checklist' }} />
        <Stack.Screen name="BlockoutCalendar"    component={BlockoutCalendarScreen}    options={{ title: 'My Availability' }} />
        <Stack.Screen name="Proposals"           component={ProposalsScreen}           options={{ title: 'Proposals' }} />
        <Stack.Screen name="AvailabilityHeatmap" component={AvailabilityHeatmapScreen} options={{ title: 'Team Availability' }} />
        <Stack.Screen name="PlanTeam"            component={PlanTeamScreen}            options={{ title: 'Team Schedule' }} />
        <Stack.Screen name="LiveService"         component={LiveServiceScreen}         options={{ headerShown: false }} />

        {/* People */}
        <Stack.Screen name="PeopleRoles"    component={PeopleRolesScreen}   options={{ title: 'People & Roles' }} />
        <Stack.Screen name="People & Roles" component={PeopleRolesScreen}   options={{ title: 'People & Roles' }} />
        <Stack.Screen name="Roles"          component={PeopleRolesScreen}   options={{ title: 'People & Roles' }} />
        <Stack.Screen name="PersonProfile"  component={PersonProfileScreen} options={{ title: 'Profile' }} />
        <Stack.Screen name="RoleSelect"     component={RoleSelectScreen}    options={{ title: 'Select Role' }} />
        <Stack.Screen name="Permissions"    component={PermissionsScreen}   options={{ title: 'Permissions' }} />
        <Stack.Screen name="Organization"   component={OrganizationScreen}  options={{ title: 'Organization' }} />
        <Stack.Screen name="MessageCenter"  component={MessageCenterScreen} options={{ title: 'Messages' }} />

        {/* Performance / Audio */}
        <Stack.Screen name="Mixer"          component={MixerScreen}          options={{ title: 'Mixer' }} />
        <Stack.Screen name="MixerConsole"   component={MixerConsoleScreen}   options={{ title: 'Mixer Console' }} />
        <Stack.Screen name="Live"           component={LiveScreen}           options={{ headerShown: false }} />
        <Stack.Screen name="LiveMode"       component={LiveModeScreen}       options={{ title: 'Live Mode' }} />
        <Stack.Screen name="Rehearsal"      component={RehearsalScreen}      options={{ headerShown: false }} />
        <Stack.Screen name="Performance"    component={PerformanceScreen}    options={{ title: 'Performance' }} />
        <Stack.Screen name="StemsCenter"    component={StemsCenterScreen}    options={{ title: 'Stems Center' }} />
        <Stack.Screen name="StemMixer"      component={StemMixerScreen}      options={{ title: 'Stem Mixer' }} />
        <Stack.Screen name="Studio"         component={StudioScreen}         options={{ title: 'Studio' }} />
        <Stack.Screen name="WaveformDetail" component={WaveformDetailScreen} options={{ title: 'Waveform' }} />
        <Stack.Screen name="StageDisplay"   component={StageDisplayScreen}   options={{ title: 'Stage Display' }} />
        <Stack.Screen name="DronePad"       component={DronePadScreen}       options={{ title: 'Drone Pad' }} />
        <Stack.Screen name="KeyChange"      component={KeyChangeScreen}      options={{ title: 'Key Change' }} />
        <Stack.Screen name="PartSheet"      component={PartSheetScreen}      options={{ title: 'Part Sheet' }} />
        <Stack.Screen name="SectionMapping" component={SectionMappingScreen} options={{ title: 'Section Mapping' }} />
        <Stack.Screen name="SongMap"        component={SongMapScreen}        options={{ title: 'Song Map' }} />

        {/* Presets */}
        <Stack.Screen name="Presets"              component={PresetsScreen}              options={{ title: 'Presets' }} />
        <Stack.Screen name="FatChannelPresets"    component={FatChannelPresetsScreen}    options={{ title: 'Fat Channel Presets' }} />
        <Stack.Screen name="PresetEditor"         component={PresetEditorScreen}         options={{ title: 'Preset Editor' }} />
        <Stack.Screen name="PresetLibraryBrowser" component={PresetLibraryBrowserScreen} options={{ title: 'Preset Library' }} />

        {/* CineStage */}
        <Stack.Screen name="CineStage"           component={CineStageScreen}           options={{ title: 'CineStage' }} />
        <Stack.Screen name="CineStageDashboard"  component={CineStageDashboardScreen}  options={{ title: 'CineStage Pro' }} />
        <Stack.Screen name="BridgeSetup"         component={BridgeSetupScreen}         options={{ title: 'Audio Bridge' }} />
        <Stack.Screen name="ExternalSync"        component={ExternalSyncScreen}        options={{ title: 'External Sync' }} />
        <Stack.Screen name="CueGrid"             component={CueGridScreen}             options={{ title: 'Cue Grid' }} />
        <Stack.Screen name="MusicDirectorRemote" component={MusicDirectorRemoteScreen} options={{ title: 'MD Remote' }} />

        {/* System */}
        <Stack.Screen name="DeviceRole"          component={DeviceRoleScreen}          options={{ title: 'Device Role' }} />
        <Stack.Screen name="DeviceSetup"         component={DeviceSetupScreen}         options={{ title: 'Device Setup' }} />
        <Stack.Screen name="BranchManager"       component={BranchManagerScreen}       options={{ title: 'Branch Manager' }} />
        <Stack.Screen name="BranchSetup"         component={BranchSetupScreen}         options={{ title: 'Branch Setup' }} />
        <Stack.Screen name="CentralAdmin"        component={CentralAdminScreen}        options={{ headerShown: false }} />
        <Stack.Screen name="AnalyticsDashboard"  component={AnalyticsDashboardScreen}  options={{ headerShown: false }} />
        <Stack.Screen name="OnboardingSystemMap" component={OnboardingSystemMap}        options={{ title: 'System Map' }} />
        <Stack.Screen name="SystemMap"           component={SystemMapScreen}            options={{ title: 'System Map' }} />
        <Stack.Screen name="Diagnostics"         component={DiagnosticsScreen}         options={{ title: 'Diagnostics' }} />
        <Stack.Screen name="TestMode"            component={TestModeScreen}            options={{ title: 'Test Mode' }} />
        <Stack.Screen name="SuggestFeature"      component={SuggestFeatureScreen}      options={{ title: 'Suggest Feature' }} />
        {/* Organizer removed from production nav */}
        <Stack.Screen name="Billing"             component={BillingScreen}             options={{ headerShown: false }} />
        <Stack.Screen name="NotificationPrefs"   component={NotificationPrefsScreen}   options={{ title: 'Notification Preferences' }} />
        <Stack.Screen name="Webhooks"            component={WebhooksScreen}            options={{ headerShown: false }} />

      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const navigationRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', { name: 'Default', importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250], lightColor: '#8B5CF6' }).catch(() => {});
      Notifications.setNotificationChannelAsync('messages', { name: 'Messages', importance: Notifications.AndroidImportance.HIGH, sound: 'default' }).catch(() => {});
      Notifications.setNotificationChannelAsync('assignments', { name: 'Assignments', importance: Notifications.AndroidImportance.HIGH, sound: 'default' }).catch(() => {});
      Notifications.setNotificationChannelAsync('reminders', { name: 'Service Reminders', importance: Notifications.AndroidImportance.DEFAULT, sound: 'default' }).catch(() => {});
    }
    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationNavigation(navigationRef, response?.notification?.request?.content?.data || {});
    });
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) handleNotificationNavigation(navigationRef, response?.notification?.request?.content?.data || {});
    }).catch(() => {});
    return () => responseSub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ThemeProvider>
          <MessageNotificationWatcher />
          <ThemedNavigator navigationRef={navigationRef} />
        </ThemeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
