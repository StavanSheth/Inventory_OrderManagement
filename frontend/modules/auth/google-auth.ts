export {
  GoogleAuthProvider,
  signInWithGoogle,
  signOutGoogle,
  getCurrentFirebaseUser,
  getFirebaseIdToken,
  onAuthStateChanged,
  onIdTokenChanged,
} from './firebase/google-auth';

import {
  signInWithGoogle,
  signOutGoogle,
  getCurrentFirebaseUser,
  onAuthStateChanged,
  onIdTokenChanged,
} from './firebase/google-auth';
import { FirebaseUser } from './types';

export interface FirebaseAuthInstance {
  currentUser: FirebaseUser | null;
  onAuthStateChanged: (callback: (user: FirebaseUser | null) => void) => () => void;
  onIdTokenChanged: (callback: (user: FirebaseUser | null) => void) => () => void;
  signOut: () => Promise<void>;
}

export function getFirebaseAuth(): FirebaseAuthInstance {
  return {
    get currentUser() {
      return getCurrentFirebaseUser();
    },
    onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
      return onAuthStateChanged(callback);
    },
    onIdTokenChanged(callback: (user: FirebaseUser | null) => void) {
      return onIdTokenChanged(callback);
    },
    async signOut() {
      await signOutGoogle();
    },
  };
}

export async function signInWithPopup(
  _auth?: FirebaseAuthInstance,
  _provider?: unknown,
): Promise<{ user: FirebaseUser }> {
  const user = await signInWithGoogle();
  return { user };
}
