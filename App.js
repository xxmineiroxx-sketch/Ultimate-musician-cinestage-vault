/**
 * Ultimate Playback - Complete Team Member App
 * Registration, Profile, Assignments, Setlist, Messages, Live Performance
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// Import screens
import LoginScreen from './src/screens_v2/LoginScreen';
import HomeScreen from './src/screens_v2/HomeScreen';
import ProfileSetupScreen from './src/screens_v2/ProfileSetupScreen';
import AssignmentsScreen from './src/screens_v2/AssignmentsScreen';
import BlockoutCalendarScreen from './src/screens_v2/BlockoutCalendarScreen';
import SetlistScreen from './src/screens_v2/SetlistScreen';
import MessagesScreen from './src/screens_v2/MessagesScreen';
import LivePerformanceScreen from './src/screens_v2/LivePerformanceScreen';
import LyricsViewScreen from './src/screens_v2/LyricsViewScreen';
import SetlistRunnerScreen from './src/screens_v2/SetlistRunnerScreen';
import AdminDashboardScreen from './src/screens_v2/AdminDashboardScreen';
import ContentEditorScreen from './src/screens_v2/ContentEditorScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Tab Navigator for main app navigation
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#020617',
          borderTopColor: '#374151',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#6B7280',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="ProfileTab"
        component={ProfileSetupScreen}
        options={{
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24 }}>👤</Text>
          ),
        }}
      />
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24 }}>🏠</Text>
          ),
        }}
      />
      <Tab.Screen
        name="SetlistTab"
        component={SetlistScreen}
        options={{
          tabBarLabel: 'Setlist',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24 }}>📋</Text>
          ),
        }}
      />
      <Tab.Screen
        name="AssignmentsTab"
        component={AssignmentsScreen}
        options={{
          tabBarLabel: 'Assignments',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24 }}>📬</Text>
          ),
        }}
      />
      <Tab.Screen
        name="MessagesTab"
        component={MessagesScreen}
        options={{
          tabBarLabel: 'Messages',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 24 }}>💬</Text>
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.appContainer}>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="Login"
          screenOptions={{
            headerStyle: { backgroundColor: '#020617' },
            headerTintColor: '#E5E7EB',
            headerTitleStyle: { fontWeight: '600' },
            cardStyle: { backgroundColor: '#020617', flex: 1 },
          }}
        >
        {/* Login Screen */}
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />

        {/* Main Tab Navigator */}
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{ headerShown: false }}
        />

        {/* Full Screen Modals */}
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'Dashboard' }}
        />
        <Stack.Screen
          name="ProfileSetup"
          component={ProfileSetupScreen}
          options={{ title: 'Profile & Roles' }}
        />
        <Stack.Screen
          name="Assignments"
          component={AssignmentsScreen}
          options={{ title: 'Service Assignments' }}
        />
        <Stack.Screen
          name="BlockoutCalendar"
          component={BlockoutCalendarScreen}
          options={{ title: 'Blockout Calendar' }}
        />
        <Stack.Screen
          name="Setlist"
          component={SetlistScreen}
          options={{ title: 'Service Setlist' }}
        />
        <Stack.Screen
          name="Messages"
          component={MessagesScreen}
          options={{ title: 'Team Messages' }}
        />
        <Stack.Screen
          name="LivePerformance"
          component={LivePerformanceScreen}
          options={{
            title: 'Live Performance',
            headerStyle: { backgroundColor: '#1E1B4B' },
          }}
        />
        <Stack.Screen
          name="LyricsView"
          component={LyricsViewScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="SetlistRunner"
          component={SetlistRunnerScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminDashboard"
          component={AdminDashboardScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ContentEditor"
          component={ContentEditorScreen}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#020617',
  },
});
