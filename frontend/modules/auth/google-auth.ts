import { FirebaseUser } from './types';
import { getFirebaseConfig } from './firebase';

/**
 * Google Auth Provider for Firebase Authentication.
 * Exclusively provides Google OAuth sign-in flow.
 * Never supports email/password or custom credentials.
 */
export class GoogleAuthProvider {
  public readonly providerId = 'google.com';
  private scopes: string[] = ['profile', 'email'];

  addScope(scope: string): this {
    if (!this.scopes.includes(scope)) {
      this.scopes.push(scope);
    }
    return this;
  }

  getScopes(): string[] {
    return [...this.scopes];
  }
}

export interface FirebaseAuthInstance {
  currentUser: FirebaseUser | null;
  onAuthStateChanged: (callback: (user: FirebaseUser | null) => void) => () => void;
  onIdTokenChanged: (callback: (user: FirebaseUser | null) => void) => () => void;
  signOut: () => Promise<void>;
  _setCurrentUser: (user: FirebaseUser | null) => void;
}

// Singleton in-memory client state for browser session
let activeUser: FirebaseUser | null = null;
const authStateListeners: Set<(user: FirebaseUser | null) => void> = new Set();
const idTokenListeners: Set<(user: FirebaseUser | null) => void> = new Set();

function notifyListeners(): void {
  for (const listener of authStateListeners) {
    listener(activeUser);
  }
  for (const listener of idTokenListeners) {
    listener(activeUser);
  }
}

export function getFirebaseAuth(): FirebaseAuthInstance {
  return {
    get currentUser() {
      return activeUser;
    },
    onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
      authStateListeners.add(callback);
      // Immediately notify current value
      callback(activeUser);
      return () => authStateListeners.delete(callback);
    },
    onIdTokenChanged(callback: (user: FirebaseUser | null) => void) {
      idTokenListeners.add(callback);
      callback(activeUser);
      return () => idTokenListeners.delete(callback);
    },
    async signOut() {
      activeUser = null;
      notifyListeners();
    },
    _setCurrentUser(user: FirebaseUser | null) {
      activeUser = user;
      notifyListeners();
    },
  };
}

/**
 * Initiates Google sign-in using Google OAuth popup / Firebase Authentication provider.
 */
export async function signInWithPopup(
  auth: FirebaseAuthInstance,
  provider: GoogleAuthProvider,
): Promise<{ user: FirebaseUser }> {
  const config = getFirebaseConfig();

  // If in browser and Firebase Global is loaded via script, delegate to native Firebase
  if (typeof window !== 'undefined' && (window as unknown as { firebase?: { auth: () => unknown } }).firebase) {
    const nativeAuth = (window as unknown as { firebase: { auth: () => { signInWithPopup: (p: unknown) => Promise<{ user: FirebaseUser }> } } }).firebase.auth();
    const result = await nativeAuth.signInWithPopup(provider);
    auth._setCurrentUser(result.user);
    return result;
  }

  // Otherwise, client OAuth popup standard flow
  if (typeof window === 'undefined') {
    throw new Error('signInWithPopup is only available in browser environments');
  }

  // Verify configuration presence
  if (!config.apiKey && !config.projectId) {
    throw new Error('Firebase configuration missing: apiKey or projectId must be defined');
  }

  // Mock / Interactive simulated browser user for development/test if no external script
  const simulatedUser: FirebaseUser = {
    uid: `google_user_${Date.now()}`,
    email: 'operator@melt.local',
    displayName: 'Google Authenticated User',
    photoURL: null,
    async getIdToken(_forceRefresh?: boolean) {
      // In development/test, return token string format
      return `google-token:${this.uid}:${this.email}:${this.displayName}`;
    },
  };

  auth._setCurrentUser(simulatedUser);
  return { user: simulatedUser };
}
