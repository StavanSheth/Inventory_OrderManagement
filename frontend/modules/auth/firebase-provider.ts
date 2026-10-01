import { getFirebaseAuth } from './google-auth';
import { FirebaseUser } from './types';

/**
 * Access the current Firebase User if authenticated.
 */
export function getCurrentFirebaseUser(): FirebaseUser | null {
  return getFirebaseAuth().currentUser;
}

/**
 * Obtains a fresh Firebase ID Token.
 * Centralized so all API clients can retrieve the active token without duplicating logic.
 */
export async function getCurrentFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const user = getCurrentFirebaseUser();
  if (!user) {
    return null;
  }
  return user.getIdToken(forceRefresh);
}

/**
 * Signs out of Firebase authentication.
 */
export async function signOutFirebase(): Promise<void> {
  await getFirebaseAuth().signOut();
}
