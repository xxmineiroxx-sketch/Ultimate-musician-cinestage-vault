
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
import LoginScreen from './screens/LoginScreen';

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
      <Tab.Screen name="Planning" component={PlanningScreen} />
      <Tab.Screen name="People & Roles" component={PeopleRolesScreen} />
      <Tab.Screen name="Stems Center" component={StemsCenterScreen} />
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
