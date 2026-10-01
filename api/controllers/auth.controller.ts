import { UserSyncService } from '../../backend/services/auth/user-sync.service';
import { SessionService } from '../../backend/services/auth/session.service';
import { UserRepository } from '../../database/repositories/user.repository';
import { hashPin } from '../../backend/services/auth/pin-hasher';
import { AuthenticatedUserContext } from '../../shared/types/auth.types';
import {
  LoginResponseData,
  VerifyPinRequest,
  VerifyPinResponseData,
  SetPinRequest,
  SetPinResponseData,
} from '../../shared/contracts/auth.contract';
import { ValidationError, BadRequestError } from '../../backend/errors/app-error';

export class AuthController {
  constructor(
    private userSyncService: UserSyncService,
    private sessionService: SessionService,
    private userRepo: UserRepository,
  ) {}

  /**
   * Completes login flow for an authenticated identity.
   */
  async login(userContext: AuthenticatedUserContext): Promise<LoginResponseData> {
    return {
      user: {
        id: userContext.userId,
        email: userContext.email,
        displayName: userContext.displayName,
        role: userContext.role,
      },
      memberships: userContext.branchMemberships.map((m) => ({
        branchId: m.branch_id,
        role: m.role,
        status: m.status,
      })),
      isOwner: userContext.isGlobalOwner,
    };
  }

  /**
   * Sets or updates user PIN for application sessions.
   */
  async setPin(userContext: AuthenticatedUserContext, body: SetPinRequest): Promise<SetPinResponseData> {
    if (!body.pin || typeof body.pin !== 'string' || body.pin.trim().length < 4) {
      throw new ValidationError('PIN must be at least 4 digits', [{ path: 'pin', message: 'Minimum 4 digits' }]);
    }

    const hashed = await hashPin(body.pin.trim());
    await this.userRepo.setPinHash(userContext.userId, hashed);

    return {
      success: true,
      message: 'PIN successfully set',
    };
  }

  /**
   * Verifies PIN and creates a time-bounded application session.
   */
  async verifyPin(userContext: AuthenticatedUserContext, body: VerifyPinRequest): Promise<VerifyPinResponseData> {
    if (!body.pin || typeof body.pin !== 'string') {
      throw new BadRequestError('PIN is required');
    }

    const { session, sessionToken } = await this.sessionService.verifyPinAndCreateSession({
      userId: userContext.userId,
      pin: body.pin.trim(),
      branchId: body.branchId,
      scope: body.scope,
    });

    return {
      sessionId: session.id,
      sessionToken,
      scope: session.scope,
      branchId: session.branch_id ?? null,
      expiresAt: session.expires_at,
    };
  }
}
