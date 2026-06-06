/**
 * Ultimate Playback - Complete Team Member App
 * Registration, Profile, Assignments, Setlist, Messages, Live Performance
 * @version 2026-05-15
 */

import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { featureFlags as screenFeatureFlags } from 'react-native-screens';

// Auth
import { isLoggedIn, logout } from './src/services/authAPI';
import { AuthContext } from './src/context/AuthContext';

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
import LeaderDashboardScreen from './src/screens_v2/LeaderDashboardScreen';
import ContentEditorScreen from './src/screens_v2/ContentEditorScreen';
import RegistrationScreen from './src/screens_v2/RegistrationScreen';
import PersonalPracticeScreen from './src/screens_v2/PersonalPracticeScreen';
import CineStageBrainScreen from './src/screens_v2/CineStageBrainScreen';
import ResetPasswordScreen from './src/screens_v2/ResetPasswordScreen';
import VerifyScreen from './src/screens_v2/VerifyScreen';
import FeedbackScreen from './src/screens_v2/FeedbackScreen';
import AppErrorBoundary from './src/components_v2/AppErrorBoundary';
import MessageNotificationWatcher from './src/components_v2/MessageNotificationWatcher';
import PushNotificationManager from './src/components_v2/PushNotificationManager';
import RoleGate from './src/components_v2/RoleGate';
import {
  flushFeedbackQueue,
  registerGlobalErrorHandler,
  setFeedbackRuntimeContext,
} from './src/services/feedback';
import { syncPushRegistration } from './src/services/pushNotifications';
import { ADMIN_GRANT_ROLES, LEADER_GRANT_ROLES } from './src/utils/roleUtils';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();
const navigationRef = createNavigationContainerRef();
const CONTENT_EDITOR_GRANT_ROLES = new Set([
  ...ADMIN_GRANT_ROLES,
  ...LEADER_GRANT_ROLES,
]);
const linking = {
  prefixes: ['ultimateplayback://'],
  config: {
    screens: {
      Main: {
        screens: {
          ProfileTab: 'profile',
          HomeTab: 'home',
          SetlistTab: 'setlist',
          AssignmentsTab: {
            path: 'assignments',
            parse: {
              serviceId: (value) => String(value || '').trim(),
              decision: (value) => String(value || '').trim().toLowerCase(),
            },
          },
          MessagesTab: 'messages',
          PracticeTab: {
            path: 'practice/:songId?',
            parse: {
              songId: (value) => String(value || '').trim(),
            },
          },
        },
      },
      Login: 'login',
      Register: 'invite',
      Verify: 'verify',
      ResetPassword: 'reset-password',
      Home: 'dashboard',
      Setlist: 'setlist-screen',
      Messages: 'messages-screen',
      PersonalPractice: {
        path: 'personal-practice/:songId?',
        parse: {
          songId: (value) => String(value || '').trim(),
        },
      },
      LyricsView: 'lyrics-view',
      SetlistRunner: 'setlist-runner',
      CineStageBrain: {
        path: 'cinestage-brain/:songId?',
        parse: {
          songId: (value) => String(value || '').trim(),
        },
      },
      AdminDashboard: 'admin',
      LeaderDashboard: 'leader',
      Feedback: 'feedback',
    },
  },
};

registerGlobalErrorHandler();

// The experimental native-controlled bottom tab implementation in newer
// react-native-screens builds is unstable in Expo Go for this app's current
// navigation stack. Keep Playback on the stable JS-controlled tab path.
if (
  screenFeatureFlags?.experiment
  && typeof screenFeatureFlags.experiment.controlledBottomTabs === 'boolean'
) {
  screenFeatureFlags.experiment.controlledBottomTabs = false;
}

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

function AdminRoute(props) {
  return (
    <RoleGate
      {...props}
      allowedRoles={ADMIN_GRANT_ROLES}
      fallbackBody="The admin panel is only available to org owners, admins, worship leaders, and music directors."
    >
      {({ role, navigation, route }) => (
        <AdminDashboardScreen
          navigation={navigation}
          route={{
            ...route,
            params: { ...(route.params || {}), mdRole: role },
          }}
        />
      )}
    </RoleGate>
  );
}

function LeaderRoute(props) {
  return (
    <RoleGate
      {...props}
      allowedRoles={LEADER_GRANT_ROLES}
      fallbackBody="The service planner workspace is only available to approved service planners."
    >
      {({ navigation, route, profile }) => (
        <LeaderDashboardScreen
          navigation={navigation}
          route={{
            ...route,
            params: {
              ...(route.params || {}),
              leaderEmail: profile?.email || route.params?.leaderEmail || '',
              leaderName: profile?.name || route.params?.leaderName || '',
            },
          }}
        />
      )}
    </RoleGate>
  );
}

function ContentEditorRoute(props) {
  return (
    <RoleGate
      {...props}
      allowedRoles={CONTENT_EDITOR_GRANT_ROLES}
      fallbackBody="Content editing is only available to approved leaders. Team members can send part updates from assigned service screens."
    >
      {({ role, navigation, route }) => (
        <ContentEditorScreen
          navigation={navigation}
          route={{
            ...route,
            params: {
              ...(route.params || {}),
              grantRole: role,
              isAdmin: ADMIN_GRANT_ROLES.has(role),
            },
          }}
        />
      )}
    </RoleGate>
  );
}

export default function App() {
  const lastRouteNameRef = useRef('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    isLoggedIn()
      .then((loggedIn) => {
        if (mounted) setIsAuthenticated(loggedIn);
      })
      .catch(() => {
        if (mounted) setIsAuthenticated(false);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => { mounted = false; };
  }, []);

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
      syncPushRegistration().catch(() => {});
    }
  };

  const handleSignOut = async () => {
    await logout().catch(() => {});
    setIsAuthenticated(false);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#818CF8" size="large" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, signOut: handleSignOut, setAuthenticated: setIsAuthenticated }}>
      <GestureHandlerRootView style={styles.appContainer}>
        <AppErrorBoundary getCurrentRouteName={() => navigationRef.getCurrentRoute()?.name || lastRouteNameRef.current}>
          <MessageNotificationWatcher />
          <PushNotificationManager navigationRef={navigationRef} />
          <NavigationContainer
            ref={navigationRef}
            linking={linking}
            onReady={syncCurrentRoute}
            onStateChange={syncCurrentRoute}
          >
            <Stack.Navigator
              initialRouteName={isAuthenticated ? 'Main' : 'Login'}
              screenOptions={{
                headerStyle: { backgroundColor: '#020617' },
                headerTintColor: '#E5E7EB',
                headerTitleStyle: { fontWeight: '600' },
                cardStyle: { backgroundColor: '#020617', flex: 1 },
              }}
            >
            {!isAuthenticated ? (
              <>
                {/* Auth stack */}
                <Stack.Screen
                  name="Login"
                  component={LoginScreen}
                  options={{ headerShown: false }}
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
              </>
            ) : (
              <>
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
                  component={AdminRoute}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="LeaderDashboard"
                  component={LeaderRoute}
                  options={{ headerShown: false }}
                />
                <Stack.Screen
                  name="ContentEditor"
                  component={ContentEditorRoute}
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
                  name="CineStageBrain"
                  component={CineStageBrainScreen}
                  options={{
                    title: 'CineStage Brain',
                    headerStyle: { backgroundColor: '#020617' },
                  }}
                />
              </>
            )}
          </Stack.Navigator>
        </NavigationContainer>
        </AppErrorBoundary>
      </GestureHandlerRootView>
    </AuthContext.Provider>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#020617',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#020617',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
