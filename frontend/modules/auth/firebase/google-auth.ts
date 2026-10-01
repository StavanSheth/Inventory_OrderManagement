import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  onIdTokenChanged as firebaseOnIdTokenChanged,
  User as FirebaseSDKUser,
} from 'firebase/auth';
import { getClientAuth } from './client';
import { FirebaseUser } from '../types';

export { GoogleAuthProvider };

export async function signInWithGoogle(): Promise<FirebaseUser> {
  const auth = getClientAuth();
  if (!auth) {
    throw new Error('Firebase Auth is not initialized. Please verify Firebase client configuration.');
  }

  const provider = new GoogleAuthProvider();
  provider.addScope('profile');
  provider.addScope('email');

  const userCredential = await signInWithPopup(auth, provider);
  const user = userCredential.user;

  return mapFirebaseSdkUser(user);
}

export async function signOutGoogle(): Promise<void> {
  const auth = getClientAuth();
  if (!auth) {
    return;
  }
  await firebaseSignOut(auth);
}

export function getCurrentFirebaseUser(): FirebaseUser | null {
  const auth = getClientAuth();
  if (!auth || !auth.currentUser) {
    return null;
  }
  return mapFirebaseSdkUser(auth.currentUser);
}

export async function getFirebaseIdToken(forceRefresh = false): Promise<string | null> {
  const auth = getClientAuth();
  if (!auth || !auth.currentUser) {
    return null;
  }
  return auth.currentUser.getIdToken(forceRefresh);
}

export function onAuthStateChanged(callback: (user: FirebaseUser | null) => void): () => void {
  const auth = getClientAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }

  return firebaseOnAuthStateChanged(auth, (user) => {
    callback(user ? mapFirebaseSdkUser(user) : null);
  });
}

export function onIdTokenChanged(callback: (user: FirebaseUser | null) => void): () => void {
  const auth = getClientAuth();
  if (!auth) {
    callback(null);
    return () => {};
  }

  return firebaseOnIdTokenChanged(auth, (user) => {
    callback(user ? mapFirebaseSdkUser(user) : null);
  });
}

function mapFirebaseSdkUser(user: FirebaseSDKUser): FirebaseUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    getIdToken: (forceRefresh?: boolean) => user.getIdToken(forceRefresh),
  };
}
