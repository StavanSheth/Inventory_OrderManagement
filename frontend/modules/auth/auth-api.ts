import { authClient } from './auth-client';
import {
  LoginResponseData,
  VerifyPinRequest,
  VerifyPinResponseData,
  SetPinResponseData,
} from '../../../shared/contracts/auth.contract';

export async function loginWithBackendAuth(): Promise<LoginResponseData> {
  return authClient.login();
}

export async function verifyPinSession(payload: VerifyPinRequest): Promise<VerifyPinResponseData> {
  return authClient.verifyPin(payload);
}

export async function setAccountPin(pin: string): Promise<SetPinResponseData> {
  return authClient.setPin(pin);
}

export async function revokeCurrentSession(sessionId?: string): Promise<void> {
  return authClient.revokeSession(sessionId);
}

export async function revokeAllUserSessions(): Promise<void> {
  return authClient.revokeAllSessions();
}
