/**
 * Ultimate Playback - Complete Team Member App
 * Registration, Profile, Assignments, Setlist, Messages, Live Performance
 */

import React, { useEffect, useRef } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import RegistrationScreen from './src/screens_v2/RegistrationScreen';
import PersonalPracticeScreen from './src/screens_v2/PersonalPracticeScreen';
import ResetPasswordScreen from './src/screens_v2/ResetPasswordScreen';
import VerifyScreen from './src/screens_v2/VerifyScreen';
import FeedbackScreen from './src/screens_v2/FeedbackScreen';
import AppErrorBoundary from './src/components_v2/AppErrorBoundary';
import {
  flushFeedbackQueue,
  registerGlobalErrorHandler,
  setFeedbackRuntimeContext,
} from './src/services/feedback';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();

registerGlobalErrorHandler();

function tabIcon(icon, size) {
  return <Text style={{ fontSize: size }}>{icon}</Text>;
}

// Tab Navigator for main app navigation
function MainTabs() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isCompact = width < 460;
  const isVeryCompact = width < 390;
  const bottomPadding = Math.max(insets.bottom, isCompact ? 8 : 10);
  const iconSize = isVeryCompact ? 19 : isCompact ? 20 : 22;
  const labelSize = isVeryCompact ? 9 : isCompact ? 10 : 11;
  const tabBarHeight = 54 + bottomPadding + (isCompact ? 0 : 2);
  const labels = isCompact
    ? {
        profile: 'Me',
        home: 'Home',
        setlist: 'Setlist',
        assignments: 'Assign',
        messages: 'Inbox',
        practice: 'Practice',
      }
    : {
        profile: 'Profile',
        home: 'Home',
        setlist: 'Setlist',
        assignments: 'Assignments',
        messages: 'Messages',
        practice: 'Practice',
      };

  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: '#020617',
          borderTopColor: '#374151',
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingBottom: bottomPadding,
          paddingTop: isCompact ? 6 : 8,
        },
        tabBarItemStyle: {
          paddingHorizontal: isVeryCompact ? 0 : 2,
        },
        tabBarActiveTintColor: '#4F46E5',
        tabBarInactiveTintColor: '#6B7280',
        tabBarLabelStyle: {
          fontSize: labelSize,
          fontWeight: '600',
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
        },
      }}
    >
      <Tab.Screen
        name="ProfileTab"
        component={ProfileSetupScreen}
        options={{
          tabBarLabel: labels.profile,
          tabBarIcon: () => tabIcon('👤', iconSize),
        }}
      />
      <Tab.Screen
        name="HomeTab"
        component={HomeScreen}
        options={{
          tabBarLabel: labels.home,
          tabBarIcon: () => tabIcon('🏠', iconSize),
        }}
      />
      <Tab.Screen
        name="SetlistTab"
        component={SetlistScreen}
        options={{
          tabBarLabel: labels.setlist,
          tabBarIcon: () => tabIcon('📋', iconSize),
        }}
      />
      <Tab.Screen
        name="AssignmentsTab"
        component={AssignmentsScreen}
        options={{
          tabBarLabel: labels.assignments,
          tabBarIcon: () => tabIcon('📬', iconSize),
        }}
      />
      <Tab.Screen
        name="MessagesTab"
        component={MessagesScreen}
        options={{
          tabBarLabel: labels.messages,
          tabBarIcon: () => tabIcon('💬', iconSize),
        }}
      />
      <Tab.Screen
        name="PracticeTab"
        component={PersonalPracticeScreen}
        options={{
          tabBarLabel: labels.practice,
          tabBarIcon: () => tabIcon('🎧', iconSize),
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const lastRouteNameRef = useRef('');

  useEffect(() => {
    flushFeedbackQueue().catch(() => {});
  }, []);

  const syncCurrentRoute = () => {
    if (!navigationRef.isReady()) return;
    const currentRoute = navigationRef.getCurrentRoute();
    const routeName = currentRoute?.name || '';
    if (routeName && routeName !== lastRouteNameRef.current) {
      lastRouteNameRef.current = routeName;
      setFeedbackRuntimeContext({ routeName });
    }
  };

  return (
    <GestureHandlerRootView style={styles.appContainer}>
      <AppErrorBoundary getCurrentRouteName={() => navigationRef.getCurrentRoute()?.name || lastRouteNameRef.current}>
        <NavigationContainer
          ref={navigationRef}
          onReady={syncCurrentRoute}
          onStateChange={syncCurrentRoute}
        >
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
          <Stack.Screen
            name="PersonalPractice"
            component={PersonalPracticeScreen}
            options={{
              title: 'My Practice',
              headerStyle: { backgroundColor: '#020617' },
            }}
          />
          <Stack.Screen
            name="Register"
            component={RegistrationScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Verify"
            component={VerifyScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ResetPassword"
            component={ResetPasswordScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Feedback"
            component={FeedbackScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#020617',
  },
});
