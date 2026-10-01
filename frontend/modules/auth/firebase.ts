import { config } from '../../../config/runtime';

export interface FirebaseClientConfig {
  apiKey?: string;
  projectId?: string;
  authDomain?: string;
}

export function getFirebaseConfig(): FirebaseClientConfig {
  return {
    apiKey: config.firebase.publicApiKey,
    projectId: config.firebase.projectId,
    authDomain: config.firebase.projectId ? `${config.firebase.projectId}.firebaseapp.com` : undefined,
  };
}
