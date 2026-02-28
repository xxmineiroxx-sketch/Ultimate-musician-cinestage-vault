/**
 * Ultimate Playback App
 * Musician's personal workspace for creating song presets
 *
 * Phase 1: Basic Nord Stage & MODX preset creation and triggering
 */

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

// Screens
import HomeScreen from './src/screens/HomeScreen';
import SongListScreen from './src/screens/SongListScreen';
import SongCreationScreen from './src/screens/SongCreationScreen';
import DeviceSetupScreen from './src/screens/DeviceSetupScreen';
import PresetEditorScreen from './src/screens/PresetEditorScreen';
import TestModeScreen from './src/screens/TestModeScreen';
import SectionMappingScreen from './src/screens/SectionMappingScreen';
import PresetLibraryBrowserScreen from './src/screens/PresetLibraryBrowserScreen';
import KeyChangeScreen from './src/screens/KeyChangeScreen';

const Stack = createStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="light" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#020617',
          },
          headerTintColor: '#F9FAFB',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          cardStyle: {
            backgroundColor: '#020617',
          },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Ultimate Playback' }}
        />
        <Stack.Screen
          name="SongList"
          component={SongListScreen}
          options={{ title: 'My Songs' }}
        />
        <Stack.Screen
          name="SongCreation"
          component={SongCreationScreen}
          options={{ title: 'Create Song' }}
        />
        <Stack.Screen
          name="DeviceSetup"
          component={DeviceSetupScreen}
          options={{ title: 'Device Setup' }}
        />
        <Stack.Screen
          name="PresetEditor"
          component={PresetEditorScreen}
          options={{ title: 'Edit Preset' }}
        />
        <Stack.Screen
          name="TestMode"
          component={TestModeScreen}
          options={{ title: 'Test Preset' }}
        />
        <Stack.Screen
          name="SectionMapping"
          component={SectionMappingScreen}
          options={{ title: 'Section Mappings' }}
        />
        <Stack.Screen
          name="PresetLibraryBrowser"
          component={PresetLibraryBrowserScreen}
          options={{ title: 'Preset Library' }}
        />
        <Stack.Screen
          name="KeyChange"
          component={KeyChangeScreen}
          options={{ title: 'Change Key' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
