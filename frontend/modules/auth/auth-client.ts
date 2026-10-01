import {
  LoginResponseData,
  VerifyPinRequest,
  VerifyPinResponseData,
  SetPinResponseData,
} from '../../../shared/contracts/auth.contract';
import { ApiResponseContract } from '../../../shared/contracts/api-response';
import { API_V1_PREFIX } from '../../../shared/constants/api.constants';
import { getCurrentFirebaseIdToken } from './firebase-provider';

export class AuthClient {
  private activeSessionToken: string | null = null;

  constructor(private baseUrl: string = '') {}

  /**
   * Sets the active application session token.
   */
  setSessionToken(token: string | null): void {
    this.activeSessionToken = token;
  }

  /**
   * Centralized helper to build authorized headers with a fresh Firebase ID token
   * and optional application session token.
   */
  async getAuthorizedHeaders(options: { requireSession?: boolean } = {}): Promise<Record<string, string>> {
    const idToken = await getCurrentFirebaseIdToken();
    if (!idToken) {
      throw new Error('User is not authenticated with Firebase');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    };

    if (options.requireSession) {
      if (!this.activeSessionToken) {
        throw new Error('Application PIN session is required');
      }
      headers['x-session-token'] = this.activeSessionToken;
    } else if (this.activeSessionToken) {
      headers['x-session-token'] = this.activeSessionToken;
    }

    return headers;
  }

  /**
   * Authenticates with the backend using a fresh Firebase ID token.
   */
  async login(): Promise<LoginResponseData> {
    const headers = await this.getAuthorizedHeaders();
    const idToken = await getCurrentFirebaseIdToken();

    const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ idToken }),
    });

    const json = (await res.json()) as ApiResponseContract<LoginResponseData>;
    if (!json.success) {
      throw new Error(json.error.message);
    }
    return json.data;
  }

  /**
   * Verifies PIN and creates a time-bounded application session.
   */
  async verifyPin(payload: VerifyPinRequest): Promise<VerifyPinResponseData> {
    const headers = await this.getAuthorizedHeaders();

    const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/auth/verify-pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as ApiResponseContract<VerifyPinResponseData>;
    if (!json.success) {
      throw new Error(json.error.message);
    }

    this.activeSessionToken = json.data.sessionToken;
    return json.data;
  }

  /**
   * Sets or updates user PIN.
   */
  async setPin(pin: string): Promise<SetPinResponseData> {
    const headers = await this.getAuthorizedHeaders();

    const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/auth/pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pin }),
    });

    const json = (await res.json()) as ApiResponseContract<SetPinResponseData>;
    if (!json.success) {
      throw new Error(json.error.message);
    }
    return json.data;
  }

  /**
   * Clears the stored session token.
   */
  clearSession(): void {
    this.activeSessionToken = null;
  }
}

export const authClient = new AuthClient();
