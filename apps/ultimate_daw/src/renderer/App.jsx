import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';

import { store } from './services/store';

import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import BrainPanel from './components/BrainPanel';
import { BrainProvider } from './context/BrainContext';

// ── Screen imports ────────────────────────────────────────────────────────────
import LoginScreen from './screens/LoginScreen';
import RegistrationScreen from './screens/RegistrationScreen';
import VerifyScreen from './screens/VerifyScreen';
import ResetPasswordScreen from './screens/ResetPasswordScreen';
import HomeScreen from './screens/HomeScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import AssignmentsScreen from './screens/AssignmentsScreen';
import BlockoutCalendarScreen from './screens/BlockoutCalendarScreen';
import SetlistScreen from './screens/SetlistScreen';
import MessagesScreen from './screens/MessagesScreen';
import LivePerformanceScreen from './screens/LivePerformanceScreen';
import LyricsViewScreen from './screens/LyricsViewScreen';
import SetlistRunnerScreen from './screens/SetlistRunnerScreen';
import AdminDashboardScreen from './screens/AdminDashboardScreen';
import LeaderDashboardScreen from './screens/LeaderDashboardScreen';
import ContentEditorScreen from './screens/ContentEditorScreen';
import PersonalPracticeScreen from './screens/PersonalPracticeScreen';
import CineStageBrainScreen from './screens/CineStageBrainScreen';
import FeedbackScreen from './screens/FeedbackScreen';
import DAWWorkspaceScreen from './screens/DAWWorkspaceScreen';

// ── Auth Context ──────────────────────────────────────────────────────────────
export const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [profile, setProfileState] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function hydrate() {
      try {
        const savedUser = await store.getUser();
        const savedProfile = await store.getProfile();
        if (savedUser) setUserState(savedUser);
        if (savedProfile) setProfileState(savedProfile);
      } catch (err) {
        console.error('[Auth] Hydration error:', err);
      } finally {
        setLoading(false);
      }
    }
    hydrate();
  }, []);

  const setUser = useCallback(async (u) => {
    setUserState(u);
    if (u) {
      await store.setUser(u);
    } else {
      await store.delete('auth_user');
    }
  }, []);

  const setProfile = useCallback(async (p) => {
    setProfileState(p);
    if (p) {
      await store.setProfile(p);
    } else {
      await store.delete('user_profile');
    }
  }, []);

  const logout = useCallback(async () => {
    await store.clearAll();
    setUserState(null);
    setProfileState(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#020617]">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, profile, setUser, setProfile, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Route guards ──────────────────────────────────────────────────────────────
function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

function RedirectIfAuth({ children }) {
  const { user } = useAuth();
  if (user) {
    return <Navigate to="/home" replace />;
  }
  return children;
}

// ── Protected layout: sidebar + topbar + content ──────────────────────────────
function ProtectedLayout({ children }) {
  return (
    <BrainProvider>
      <div className="flex h-full overflow-hidden" style={{ background: '#020617' }}>
        <Sidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
        <BrainPanel />
      </div>
    </BrainProvider>
  );
}

// ── Root redirect ─────────────────────────────────────────────────────────────
function RootRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? '/home' : '/login'} replace />;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Root */}
        <Route path="/" element={<RootRedirect />} />

        {/* Public auth routes — full screen, no sidebar */}
        <Route
          path="/login"
          element={
            <RedirectIfAuth>
              <LoginScreen />
            </RedirectIfAuth>
          }
        />
        <Route
          path="/register"
          element={
            <RedirectIfAuth>
              <RegistrationScreen />
            </RedirectIfAuth>
          }
        />
        <Route
          path="/verify"
          element={
            <RedirectIfAuth>
              <VerifyScreen />
            </RedirectIfAuth>
          }
        />
        <Route
          path="/reset-password"
          element={
            <RedirectIfAuth>
              <ResetPasswordScreen />
            </RedirectIfAuth>
          }
        />

        {/* Protected routes — sidebar layout */}
        <Route
          path="/home"
          element={
            <RequireAuth>
              <ProtectedLayout><HomeScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProtectedLayout><ProfileSetupScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/assignments"
          element={
            <RequireAuth>
              <ProtectedLayout><AssignmentsScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/blockout"
          element={
            <RequireAuth>
              <ProtectedLayout><BlockoutCalendarScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/setlist"
          element={
            <RequireAuth>
              <ProtectedLayout><SetlistScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/messages"
          element={
            <RequireAuth>
              <ProtectedLayout><MessagesScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/live-performance"
          element={
            <RequireAuth>
              <ProtectedLayout><LivePerformanceScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/lyrics"
          element={
            <RequireAuth>
              <ProtectedLayout><LyricsViewScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/setlist-runner"
          element={
            <RequireAuth>
              <ProtectedLayout><SetlistRunnerScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <ProtectedLayout><AdminDashboardScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/leader"
          element={
            <RequireAuth>
              <ProtectedLayout><LeaderDashboardScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/content-editor"
          element={
            <RequireAuth>
              <ProtectedLayout><ContentEditorScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/practice"
          element={
            <RequireAuth>
              <ProtectedLayout><PersonalPracticeScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/cinestage"
          element={
            <RequireAuth>
              <ProtectedLayout><CineStageBrainScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/feedback"
          element={
            <RequireAuth>
              <ProtectedLayout><FeedbackScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/daw"
          element={
            <RequireAuth>
              <ProtectedLayout><DAWWorkspaceScreen /></ProtectedLayout>
            </RequireAuth>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
