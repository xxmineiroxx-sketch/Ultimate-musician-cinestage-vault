/**
 * Auth Context
 * Provides global auth state and sign-out trigger for the root navigator.
 * Used by App.js (provider) and any screen that needs to force a re-auth flow.
 */

import React, { createContext, useContext } from 'react';

export const AuthContext = createContext({
  isAuthenticated: false,
  signOut: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}
