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
  private devIdToken: string | null = null;

  constructor(private baseUrl: string = '') {}

  /**
   * Sets the active application session token with localStorage persistence.
   */
  setSessionToken(token: string | null): void {
    this.activeSessionToken = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('melt_session_token', token);
      } else {
        localStorage.removeItem('melt_session_token');
      }
    }
  }

  getSessionToken(): string | null {
    if (this.activeSessionToken) return this.activeSessionToken;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('melt_session_token');
    }
    return null;
  }

  setDevIdToken(token: string | null): void {
    this.devIdToken = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('melt_dev_token', token);
      } else {
        localStorage.removeItem('melt_dev_token');
      }
    }
  }

  getDevIdToken(): string | null {
    if (this.devIdToken) return this.devIdToken;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('melt_dev_token');
    }
    return null;
  }

  /**
   * Retrieves the current user's Firebase ID token or dev token.
   */
  async getIdToken(): Promise<string | null> {
    return (await getCurrentFirebaseIdToken()) ?? this.getDevIdToken();
  }

  /**
   * Centralized helper to build authorized headers with a fresh Firebase ID token
   * and optional application session token.
   * On localhost dev, automatically resolves appropriate demo credentials.
   */
  async getAuthorizedHeaders(options: { requireSession?: boolean } = {}): Promise<Record<string, string>> {
    let idToken = await getCurrentFirebaseIdToken();
    if (!idToken) {
      idToken = this.getDevIdToken();
    }

    // Auto-fallback in local development mode with subdomain awareness
    if (!idToken && typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
      if (isLocalHost) {
        const isOwnerContext =
          host.startsWith('owner.') ||
          host.startsWith('admin.') ||
          window.location.pathname.startsWith('/owner');

        const isOperatorContext =
          host.startsWith('operator.') ||
          host.startsWith('staff.') ||
          host.startsWith('pos.') ||
          host.startsWith('op-') ||
          host.startsWith('staff-') ||
          host.startsWith('desk-') ||
          host.startsWith('alpha.') ||
          host.startsWith('beta.') ||
          window.location.pathname.startsWith('/operator');

        if (isOwnerContext) {
          idToken = 'mock-user:fb-owner-master:owner@melt.example.com:Stavan Sheth (Owner)';
        } else if (isOperatorContext) {
          if (host.includes('beta')) {
            idToken = 'mock-user:fb-op-beta:operator.beta@melt.example.com:Anita Desai (Beta Lead)';
          } else {
            idToken = 'mock-user:fb-op-alpha:operator.alpha@melt.example.com:Raj Patel (Alpha Lead)';
          }
        } else {
          idToken = 'mock-user:fb-cust-alice:alice@example.com:Alice Walker';
        }
        this.setDevIdToken(idToken);
      }
    }

    if (!idToken) {
      throw new Error('User is not authenticated with Firebase');
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    };

    let sessionToken = this.getSessionToken();

    // Auto-verify PIN in localhost dev if session is required but not yet established
    if (options.requireSession && !sessionToken && typeof window !== 'undefined') {
      const host = window.location.hostname.toLowerCase();
      const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
      if (isLocalHost) {
        try {
          const isOwner =
            host.startsWith('owner.') ||
            host.startsWith('admin.') ||
            window.location.pathname.startsWith('/owner');
          const verifyPayload: VerifyPinRequest = {
            pin: '123456',
            scope: isOwner ? 'GLOBAL' : 'BRANCH',
            branchId: isOwner ? undefined : 'branch-alpha',
          };
          const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/auth/verify-pin`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify(verifyPayload),
          });
          const json = (await res.json()) as ApiResponseContract<VerifyPinResponseData>;
          if (json.success && json.data.sessionToken) {
            sessionToken = json.data.sessionToken;
            this.setSessionToken(sessionToken);
          }
        } catch {
          // Fall through
        }
      }
    }

    if (options.requireSession) {
      if (!sessionToken) {
        throw new Error('Application PIN session is required');
      }
      headers['x-session-token'] = sessionToken;
    } else if (sessionToken) {
      headers['x-session-token'] = sessionToken;
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

  /**
   * Revokes an application session.
   */
  async revokeSession(sessionId?: string): Promise<void> {
    const headers = await this.getAuthorizedHeaders();

    const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/auth/revoke-session`, {
      method: 'POST',
      headers,
      body: JSON.stringify(sessionId ? { sessionId } : {}),
    });

    const json = (await res.json()) as ApiResponseContract<{ success: boolean }>;
    if (!json.success) {
      throw new Error(json.error.message);
    }
    this.clearSession();
  }

  /**
   * Revokes all application sessions for current user.
   */
  async revokeAllSessions(): Promise<void> {
    const headers = await this.getAuthorizedHeaders();

    const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/auth/revoke-all-sessions`, {
      method: 'POST',
      headers,
    });

    const json = (await res.json()) as ApiResponseContract<{ success: boolean }>;
    if (!json.success) {
      throw new Error(json.error.message);
    }
    this.clearSession();
  }
}

export const authClient = new AuthClient();
