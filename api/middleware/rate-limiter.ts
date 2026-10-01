import { TooManyRequestsError } from '../../backend/errors/app-error';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory sliding window rate-limiter compatible with Cloudflare Workers / Node.js
const limitRecords = new Map<string, RateLimitRecord>();

export interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
}

export function checkRateLimit(
  request: Request,
  options: RateLimitOptions = {},
): void {
  // Allow disabling in specific test scenarios if needed
  if (process.env.DISABLE_RATE_LIMIT === 'true') {
    return;
  }

  const windowMs = options.windowMs ?? 60 * 1000; // 1 minute default
  const maxRequests = options.maxRequests ?? 60; // 60 requests/min default
  const keyPrefix = options.keyPrefix ?? 'rate-limit';

  const clientIp =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'client-default';

  const key = `${keyPrefix}:${clientIp}`;
  const now = Date.now();
  const record = limitRecords.get(key);

  if (!record || record.resetAt <= now) {
    limitRecords.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (record.count >= maxRequests) {
    const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
    throw new TooManyRequestsError(
      `Too many requests. Please try again after ${retryAfterSeconds} seconds.`,
      { retryAfter: retryAfterSeconds },
    );
  }

  record.count += 1;
}

export function resetRateLimits(): void {
  limitRecords.clear();
}
