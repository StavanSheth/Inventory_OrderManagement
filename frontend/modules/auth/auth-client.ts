import {
  LoginResponseData,
  VerifyPinRequest,
  VerifyPinResponseData,
  SetPinResponseData,
} from '../../../shared/contracts/auth.contract';
import { ApiResponseContract } from '../../../shared/contracts/api-response';
import { API_V1_PREFIX } from '../../../shared/constants/api.constants';

export class AuthClient {
  constructor(private baseUrl: string = '') {}

  /**
   * Authenticates with the backend using a verified Firebase ID token.
   */
  async loginWithIdToken(idToken: string): Promise<LoginResponseData> {
    const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
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
  async verifyPin(idToken: string, payload: VerifyPinRequest): Promise<VerifyPinResponseData> {
    const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/auth/verify-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as ApiResponseContract<VerifyPinResponseData>;
    if (!json.success) {
      throw new Error(json.error.message);
    }
    return json.data;
  }

  /**
   * Sets or updates user PIN.
   */
  async setPin(idToken: string, pin: string): Promise<SetPinResponseData> {
    const res = await fetch(`${this.baseUrl}${API_V1_PREFIX}/auth/pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ pin }),
    });

    const json = (await res.json()) as ApiResponseContract<SetPinResponseData>;
    if (!json.success) {
      throw new Error(json.error.message);
    }
    return json.data;
  }
}

export const authClient = new AuthClient();
