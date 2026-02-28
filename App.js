import React from 'react';
import { LogBox } from 'react-native';

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

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

import LandingScreen from './screens/LandingScreen';
import HomeScreen from './screens/HomeScreen';
import LibraryScreen from './screens/LibraryScreen';
import NewSongScreen from './screens/NewSongScreen';
import SongDetailScreen from './screens/SongDetailScreen';
import PlanningScreen from './screens/PlanningScreen';
import PeopleRolesScreen from './screens/PeopleRolesScreen';
import PersonProfileScreen from './screens/PersonProfileScreen';
import MixerScreen from './screens/MixerScreen';
import LiveScreen from './screens/LiveScreen';
import LiveModeScreen from './screens/LiveModeScreen';
import RehearsalScreen from './screens/RehearsalScreen';
import StemsCenterScreen from './screens/StemsCenterScreen';
import StemMixerScreen from './screens/StemMixerScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import StageDisplayScreen from './screens/StageDisplayScreen';
import DronePadScreen from './screens/DronePadScreen';
import CineStageScreen from './screens/CineStageScreen';
import CineStageDashboardScreen from './screens/CineStageDashboardScreen';
import BridgeSetupScreen from './screens/BridgeSetupScreen';
import CueGridScreen from './screens/CueGridScreen';
import DeviceRoleScreen from './screens/DeviceRoleScreen';
import ExternalSyncScreen from './screens/ExternalSyncScreen';
import FatChannelPresetsScreen from './screens/FatChannelPresetsScreen';
import OnboardingSystemMap from './screens/OnboardingSystemMap';
import CalendarScreen from './screens/CalendarScreen';
import ChecklistScreen from './screens/ChecklistScreen';
import DeviceSetupScreen from './screens/DeviceSetupScreen';
import DiagnosticsScreen from './screens/DiagnosticsScreen';
import KeyChangeScreen from './screens/KeyChangeScreen';
import MessageCenterScreen from './screens/MessageCenterScreen';
import PermissionsScreen from './screens/PermissionsScreen';
import ProposalsScreen from './screens/ProposalsScreen';
import BlockoutCalendarScreen from './screens/BlockoutCalendarScreen';
import NewServiceScreen from './screens/NewServiceScreen';
import OrganizerScreen from './screens/OrganizerScreen';
import PlanningCenterScreen from './screens/PlanningCenterScreen';
import PresetEditorScreen from './screens/PresetEditorScreen';
import PresetLibraryBrowserScreen from './screens/PresetLibraryBrowserScreen';
import PresetsScreen from './screens/PresetsScreen';
import ProfileScreen from './screens/ProfileScreen';
import RoleSelectScreen from './screens/RoleSelectScreen';
import SectionMappingScreen from './screens/SectionMappingScreen';
import SuggestFeatureScreen from './screens/SuggestFeatureScreen';
import TestModeScreen from './screens/TestModeScreen';
import PerformanceScreen from './screens/PerformanceScreen';
import ServicePlanScreen from './screens/ServicePlanScreen';
import SongPlanDetailScreen from './screens/SongPlanDetailScreen';
import SetlistScreen from './screens/SetlistScreen';
import SettingsScreen from './screens/SettingsScreen';
import SongMapScreen from './screens/SongMapScreen';
import SystemMapScreen from './screens/SystemMapScreen';
import WaveformDetailScreen from './screens/WaveformDetailScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="Landing"
            screenOptions={{
              headerStyle: { backgroundColor: '#020617' },
              headerTintColor: '#E5E7EB',
              headerTitleStyle: { fontWeight: '600' },
              contentStyle: { backgroundColor: '#020617' },
            }}
          >
            {/* Entry / Auth */}
            <Stack.Screen name="Landing" component={LandingScreen} options={{ headerShown: false }} />

            {/* Core */}
            <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Library" component={LibraryScreen} options={{ title: 'Library' }} />
            <Stack.Screen name="NewSong" component={NewSongScreen} options={{ title: 'Ultimate Musician' }} />
            <Stack.Screen name="SongDetail" component={SongDetailScreen} options={{ title: 'Song Detail' }} />

            {/* Planning */}
            <Stack.Screen name="Planning" component={PlanningScreen} options={{ title: 'Planning Center' }} />
            <Stack.Screen name="PlanningCenter" component={PlanningCenterScreen} options={{ title: 'Planning Center' }} />
            <Stack.Screen name="Calendar" component={CalendarScreen} options={{ title: 'Calendar' }} />
            <Stack.Screen name="NewService" component={NewServiceScreen} options={{ title: 'New Service' }} />
            <Stack.Screen name="Checklist" component={ChecklistScreen} options={{ title: 'Pre-Live Checklist' }} />
            <Stack.Screen name="ServicePlan" component={ServicePlanScreen} options={{ title: 'Service Plan' }} />
            <Stack.Screen name="SongPlanDetail" component={SongPlanDetailScreen} options={{ title: 'Song Detail' }} />
            <Stack.Screen name="Setlist" component={SetlistScreen} options={{ title: 'Setlist' }} />

            {/* People */}
            <Stack.Screen name="People & Roles" component={PeopleRolesScreen} options={{ title: 'People & Roles' }} />
            <Stack.Screen name="Roles" component={PeopleRolesScreen} options={{ title: 'People & Roles' }} />
            <Stack.Screen name="PersonProfile" component={PersonProfileScreen} options={{ title: 'Member Profile' }} />

            {/* Live / Performance */}
            <Stack.Screen name="RoleSelect" component={RoleSelectScreen} options={{ title: 'Select Role', headerShown: false }} />
            <Stack.Screen name="Organizer" component={OrganizerScreen} options={{ title: 'Organizer' }} />
            <Stack.Screen name="Live" component={LiveScreen} options={{ title: 'Live View' }} />
            <Stack.Screen name="LiveMode" component={LiveModeScreen} options={{ title: 'Live Mode' }} />
            <Stack.Screen name="Rehearsal" component={RehearsalScreen} options={{ title: 'Rehearsal' }} />
            <Stack.Screen name="Performance" component={PerformanceScreen} options={{ title: 'Performance' }} />
            <Stack.Screen name="StageDisplay" component={StageDisplayScreen} options={{ title: 'Stage Display' }} />

            {/* Audio / Stems */}
            <Stack.Screen name="Mixer" component={MixerScreen} options={{ title: 'Mixer' }} />
            <Stack.Screen name="Stems Center" component={StemsCenterScreen} options={{ title: 'Stems Center' }} />
            <Stack.Screen name="StemMixer" component={StemMixerScreen} options={{ title: 'Stem Mixer' }} />
            <Stack.Screen name="DronePad" component={DronePadScreen} options={{ title: 'Drone Pad' }} />
            <Stack.Screen name="WaveformDetail" component={WaveformDetailScreen} options={{ title: 'Waveform Detail' }} />

            {/* CineStage / AI */}
            <Stack.Screen name="CineStage" component={CineStageScreen} options={{ title: 'CineStage' }} />
            <Stack.Screen name="CineStageDashboard" component={CineStageDashboardScreen} options={{ title: 'CineStage', headerShown: false }} />
            <Stack.Screen name="CueGrid" component={CueGridScreen} options={{ title: 'Cue Grid' }} />
            <Stack.Screen name="SongMap" component={SongMapScreen} options={{ title: 'Song Map' }} />

            {/* Device Presets (Ultimate Playback integration) */}
            <Stack.Screen name="Presets" component={PresetsScreen} options={{ title: 'Presets' }} />
            <Stack.Screen name="DeviceSetup" component={DeviceSetupScreen} options={{ title: 'Device Setup' }} />
            <Stack.Screen name="PresetEditor" component={PresetEditorScreen} options={{ title: 'Preset Editor' }} />
            <Stack.Screen name="PresetLibraryBrowser" component={PresetLibraryBrowserScreen} options={{ title: 'Preset Library' }} />
            <Stack.Screen name="SectionMapping" component={SectionMappingScreen} options={{ title: 'Section Mapping' }} />
            <Stack.Screen name="KeyChange" component={KeyChangeScreen} options={{ title: 'Key Change' }} />
            <Stack.Screen name="TestMode" component={TestModeScreen} options={{ title: 'Test Mode' }} />

            {/* Bridge / Sync */}
            <Stack.Screen name="BridgeSetup" component={BridgeSetupScreen} options={{ title: 'Bridge Setup' }} />
            <Stack.Screen name="ExternalSync" component={ExternalSyncScreen} options={{ title: 'External Sync' }} />
            <Stack.Screen name="DeviceRole" component={DeviceRoleScreen} options={{ title: 'Device Role' }} />
            <Stack.Screen name="SystemMap" component={SystemMapScreen} options={{ title: 'System Map' }} />
            <Stack.Screen name="OnboardingSystemMap" component={OnboardingSystemMap} options={{ title: 'System Map Setup' }} />

            {/* Gear */}
            <Stack.Screen name="FatChannelPresets" component={FatChannelPresetsScreen} options={{ title: 'Fat Channel Presets' }} />

            {/* Team */}
            <Stack.Screen name="MessageCenter" component={MessageCenterScreen} options={{ title: 'Messages' }} />
            <Stack.Screen name="Permissions" component={PermissionsScreen} options={{ title: 'Team Permissions' }} />
            <Stack.Screen name="Proposals" component={ProposalsScreen} options={{ title: 'Content Proposals' }} />
            <Stack.Screen name="BlockoutCalendar" component={BlockoutCalendarScreen} options={{ title: 'My Availability' }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />

            {/* Account */}
            <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Sign In' }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create Account' }} />

            {/* Settings / Support */}
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
            <Stack.Screen name="Diagnostics" component={DiagnosticsScreen} options={{ title: 'Diagnostics' }} />
            <Stack.Screen name="SuggestFeature" component={SuggestFeatureScreen} options={{ title: 'Suggest a Feature' }} />
          </Stack.Navigator>
        </NavigationContainer>
      </ThemeProvider>
    </AuthProvider>
  );
}
