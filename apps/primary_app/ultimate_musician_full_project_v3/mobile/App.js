import React, { useRef, useEffect } from 'react';
import { LogBox, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

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

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import MessageNotificationWatcher from './components/MessageNotificationWatcher';

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
import SongPlanDetailScreen   from './screens/SongPlanDetailScreen';
import SetlistScreen          from './screens/SetlistScreen';
import CalendarScreen         from './screens/CalendarScreen';
import ChecklistScreen        from './screens/ChecklistScreen';
import BlockoutCalendarScreen from './screens/BlockoutCalendarScreen';
import ProposalsScreen        from './screens/ProposalsScreen';

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
import OnboardingSystemMap    from './screens/OnboardingSystemMap';
import SystemMapScreen        from './screens/SystemMapScreen';
import DiagnosticsScreen      from './screens/DiagnosticsScreen';
import TestModeScreen         from './screens/TestModeScreen';
import SuggestFeatureScreen   from './screens/SuggestFeatureScreen';
import OrganizerScreen        from './screens/OrganizerScreen';
import PCOImportScreen        from './screens/PCOImportScreen';

const Stack = createNativeStackNavigator();
const HDR = { headerStyle: { backgroundColor: '#020617' }, headerTintColor: '#E5E7EB', headerTitleStyle: { fontWeight: '700' } };

/** Navigate from a push notification payload to the right screen. */
function handleNotificationNavigation(navigationRef, data = {}) {
  if (!navigationRef?.current) return;
  const { type, serviceId } = data;
  try {
    if (type === 'assignment' || type === 'reminder') {
      if (serviceId) {
        navigationRef.current.navigate('ServicePlan', { serviceId });
      } else {
        navigationRef.current.navigate('PlanningCenter');
      }
    } else if (type === 'assignment_response') {
      if (serviceId) {
        navigationRef.current.navigate('ServicePlan', { serviceId });
      } else {
        navigationRef.current.navigate('PlanningCenter');
      }
    } else if (type === 'message') {
      navigationRef.current.navigate('MessageCenter');
    } else {
      navigationRef.current.navigate('Home');
    }
  } catch (_) { /* navigation not ready yet */ }
}

export default function App() {
  const navigationRef = useRef(null);

  useEffect(() => {
    // Android notification channels (required on Android 8+)
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#8B5CF6',
      }).catch(() => {});
      Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      }).catch(() => {});
      Notifications.setNotificationChannelAsync('assignments', {
        name: 'Assignments',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
      }).catch(() => {});
      Notifications.setNotificationChannelAsync('reminders', {
        name: 'Service Reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        sound: 'default',
      }).catch(() => {});
    }

    // Handle tap on a notification (app in background or killed)
    const responseSub = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response?.notification?.request?.content?.data || {};
      handleNotificationNavigation(navigationRef, data);
    });

    // Check if app was launched by tapping a notification (killed state)
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (!response) return;
      const data = response?.notification?.request?.content?.data || {};
      handleNotificationNavigation(navigationRef, data);
    }).catch(() => {});

    return () => responseSub.remove();
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider>
        <MessageNotificationWatcher />
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator initialRouteName="Landing" screenOptions={HDR}>

            {/* Auth */}
            <Stack.Screen name="Landing"  component={LandingScreen}  options={{ headerShown: false }} />
            <Stack.Screen name="Login"    component={LoginScreen}    options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Verify"   component={VerifyScreen}   options={{ headerShown: false }} />

            {/* Core */}
            <Stack.Screen name="Home"      component={HomeScreen}      options={{ headerShown: false }} />
            <Stack.Screen name="Library"   component={LibraryScreen}   options={{ title: 'Songs' }} />
            <Stack.Screen name="NewSong"   component={NewSongScreen}   options={{ title: 'Add Song' }} />
            <Stack.Screen name="SongDetail" component={SongDetailScreen} options={{ title: 'Song Details' }} />
            <Stack.Screen name="Profile"   component={ProfileScreen}   options={{ title: 'Profile' }} />
            <Stack.Screen name="Settings"  component={SettingsScreen}  options={{ title: 'Settings' }} />

            {/* Planning */}
            <Stack.Screen name="Planning"        component={PlanningScreen}       options={{ title: 'Planning' }} />
            <Stack.Screen name="PlanningCenter"  component={PlanningCenterScreen} options={{ title: 'Planning Center' }} />
            <Stack.Screen name="PCOImport"       component={PCOImportScreen}      options={{ title: 'PCO Import' }} />
            <Stack.Screen name="NewService"      component={NewServiceScreen}     options={{ title: 'New Service' }} />
            <Stack.Screen name="ServicePlan"     component={ServicePlanScreen}    options={{ title: 'Service Plan' }} />
            <Stack.Screen name="SongPlanDetail"  component={SongPlanDetailScreen} options={{ title: 'Song Plan' }} />
            <Stack.Screen name="Setlist"         component={SetlistScreen}        options={{ title: 'Setlist' }} />
            <Stack.Screen name="Calendar"        component={CalendarScreen}       options={{ title: 'Calendar' }} />
            <Stack.Screen name="Checklist"       component={ChecklistScreen}      options={{ title: 'Checklist' }} />
            <Stack.Screen name="BlockoutCalendar" component={BlockoutCalendarScreen} options={{ title: 'My Availability' }} />
            <Stack.Screen name="Proposals"       component={ProposalsScreen}      options={{ title: 'Proposals' }} />

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
            <Stack.Screen name="CineStage"             component={CineStageScreen}           options={{ title: 'CineStage' }} />
            <Stack.Screen name="CineStageDashboard"    component={CineStageDashboardScreen}  options={{ title: 'CineStage Pro' }} />
            <Stack.Screen name="BridgeSetup"           component={BridgeSetupScreen}         options={{ title: 'Audio Bridge' }} />
            <Stack.Screen name="ExternalSync"          component={ExternalSyncScreen}        options={{ title: 'External Sync' }} />
            <Stack.Screen name="CueGrid"               component={CueGridScreen}             options={{ title: 'Cue Grid' }} />
            <Stack.Screen name="MusicDirectorRemote"   component={MusicDirectorRemoteScreen} options={{ title: 'MD Remote' }} />

            {/* System */}
            <Stack.Screen name="DeviceRole"         component={DeviceRoleScreen}       options={{ title: 'Device Role' }} />
            <Stack.Screen name="DeviceSetup"        component={DeviceSetupScreen}      options={{ title: 'Device Setup' }} />
            <Stack.Screen name="BranchManager"      component={BranchManagerScreen}    options={{ title: 'Branch Manager' }} />
            <Stack.Screen name="BranchSetup"        component={BranchSetupScreen}      options={{ title: 'Branch Setup' }} />
            <Stack.Screen name="OnboardingSystemMap" component={OnboardingSystemMap}   options={{ title: 'System Map' }} />
            <Stack.Screen name="SystemMap"          component={SystemMapScreen}        options={{ title: 'System Map' }} />
            <Stack.Screen name="Diagnostics"        component={DiagnosticsScreen}      options={{ title: 'Diagnostics' }} />
            <Stack.Screen name="TestMode"           component={TestModeScreen}         options={{ title: 'Test Mode' }} />
            <Stack.Screen name="SuggestFeature"     component={SuggestFeatureScreen}   options={{ title: 'Suggest Feature' }} />
            <Stack.Screen name="Organizer"          component={OrganizerScreen}        options={{ title: 'Organizer' }} />

          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </AuthProvider>
  );
}
