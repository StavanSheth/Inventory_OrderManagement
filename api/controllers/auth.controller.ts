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
import { ValidationError, BadRequestError, ForbiddenError } from '../../backend/errors/app-error';
import { UserRole } from '../../shared/enums/roles.enum';

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
   * Only applicable to OWNER and BRANCH_OPERATOR.
   */
  async setPin(userContext: AuthenticatedUserContext, body: SetPinRequest): Promise<SetPinResponseData> {
    const hasOperatorMembership = userContext.branchMemberships.some(
      (m) => m.role === UserRole.BRANCH_OPERATOR && m.status === 'ACTIVE',
    );
    if (!userContext.isGlobalOwner && !hasOperatorMembership) {
      throw new ForbiddenError('Customers cannot configure an application PIN');
    }

    if (!body.pin || typeof body.pin !== 'string' || !/^\d{4,8}$/.test(body.pin.trim())) {
      throw new ValidationError('PIN must be 4 to 8 numeric digits', [{ path: 'pin', message: '4 to 8 numeric digits required' }]);
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
   * Only applicable to OWNER and BRANCH_OPERATOR.
   */
  async verifyPin(userContext: AuthenticatedUserContext, body: VerifyPinRequest): Promise<VerifyPinResponseData> {
    const hasOperatorMembership = userContext.branchMemberships.some(
      (m) => m.role === UserRole.BRANCH_OPERATOR && m.status === 'ACTIVE',
    );
    if (!userContext.isGlobalOwner && !hasOperatorMembership) {
      throw new ForbiddenError('Customers cannot create application sessions');
    }

    if (!body.pin || typeof body.pin !== 'string' || !/^\d{4,8}$/.test(body.pin.trim())) {
      throw new BadRequestError('PIN must be 4 to 8 numeric digits');
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
