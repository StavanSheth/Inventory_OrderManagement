import { config } from '../../../../config/runtime';

/**
 * Public Firebase client configuration.
 * Only public credentials safe for frontend/browser execution are loaded here.
 * Never includes service account keys or private signing keys.
 */
export interface FirebasePublicConfig {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export function getPublicFirebaseConfig(): FirebasePublicConfig {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? config.firebase.publicApiKey,
    authDomain:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
      (config.firebase.projectId ? `${config.firebase.projectId}.firebaseapp.com` : undefined),
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? config.firebase.projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}
