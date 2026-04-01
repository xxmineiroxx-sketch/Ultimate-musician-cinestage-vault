
import 'react-native-url-polyfill/auto';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import HomeScreen from './screens/HomeScreen';
import LibraryScreen from './screens/LibraryScreen';
import PlanningScreen from './screens/PlanningScreen';
import PeopleRolesScreen from './screens/PeopleRolesScreen';
import StemsCenterScreen from './screens/StemsCenterScreen';
import SongDetailScreen from './screens/SongDetailScreen';
import MixerScreen from './screens/MixerScreen';
import LiveScreen from './screens/LiveScreen';
import RehearsalScreen from './screens/RehearsalScreen';
import PresetsScreen from './screens/PresetsScreen';
import DeviceSetupScreen from './screens/DeviceSetupScreen';
import PresetEditorScreen from './screens/PresetEditorScreen';
import SectionMappingScreen from './screens/SectionMappingScreen';
import PresetLibraryBrowserScreen from './screens/PresetLibraryBrowserScreen';
import KeyChangeScreen from './screens/KeyChangeScreen';
import TestModeScreen from './screens/TestModeScreen';
import LoginScreen from './screens/LoginScreen';
import ProfileScreen from './screens/ProfileScreen';
import MessageCenterScreen from './screens/MessageCenterScreen';

const _origConsoleError = console.error;
console.error = (...args) => {
  const first = args[0];
  if (
    typeof first === 'string' &&
    first.includes("Could not access feature flag")
  ) {
    return;
  }
  _origConsoleError(...args);
};

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#020617' },
        headerTintColor: '#E5E7EB',
        headerTitleStyle: { fontWeight: '600' },
        tabBarStyle: { backgroundColor: '#0B1120', borderTopColor: '#111827' },
        tabBarActiveTintColor: '#8B5CF6',
        tabBarInactiveTintColor: '#9CA3AF',
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="Presets" component={PresetsScreen} />
      <Tab.Screen name="Messages" component={MessageCenterScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer
      theme={{
        dark: true,
        colors: {
          primary: '#8B5CF6',
          background: '#020617',
          card: '#020617',
          text: '#E5E7EB',
          border: '#111827',
          notification: '#8B5CF6',
        },
        fonts: {
          regular: { fontFamily: 'System', fontWeight: '400' },
          medium: { fontFamily: 'System', fontWeight: '500' },
          bold: { fontFamily: 'System', fontWeight: '700' },
          heavy: { fontFamily: 'System', fontWeight: '800' },
        },
      }}
    >
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#020617' },
          headerTintColor: '#E5E7EB',
          headerTitleStyle: { fontWeight: '600' },
          contentStyle: { backgroundColor: '#020617' },
        }}
      >
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="SongDetail" component={SongDetailScreen} options={{ title: 'Song Detail' }} />
        <Stack.Screen name="Mixer" component={MixerScreen} options={{ title: 'Mixer' }} />
        <Stack.Screen name="Live" component={LiveScreen} options={{ title: 'Live View' }} />
        <Stack.Screen name="Rehearsal" component={RehearsalScreen} options={{ title: 'Rehearsal' }} />
        <Stack.Screen name="Planning" component={PlanningScreen} options={{ title: 'Planning' }} />
        <Stack.Screen name="PeopleRoles" component={PeopleRolesScreen} options={{ title: 'People & Roles' }} />
        <Stack.Screen name="StemsCenter" component={StemsCenterScreen} options={{ title: 'Stems Center' }} />
        <Stack.Screen name="DeviceSetup" component={DeviceSetupScreen} options={{ title: 'Device Setup' }} />
        <Stack.Screen name="PresetEditor" component={PresetEditorScreen} options={{ title: 'Edit Preset' }} />
        <Stack.Screen name="SectionMapping" component={SectionMappingScreen} options={{ title: 'Section Mappings' }} />
        <Stack.Screen name="PresetLibraryBrowser" component={PresetLibraryBrowserScreen} options={{ title: 'Preset Library' }} />
        <Stack.Screen name="KeyChange" component={KeyChangeScreen} options={{ title: 'Change Key' }} />
        <Stack.Screen name="TestMode" component={TestModeScreen} options={{ title: 'Test Preset' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
