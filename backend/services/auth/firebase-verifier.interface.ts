import { FirebaseTokenPayload } from '../../../shared/types/auth.types';

export interface IFirebaseVerifier {
  verifyIdToken(idToken: string): Promise<FirebaseTokenPayload>;
}
