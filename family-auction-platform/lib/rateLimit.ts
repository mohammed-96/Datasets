const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

type Bucket = { attempts: number; firstAttemptAt: number; lockedUntil?: number };

// In-memory limiter: correct for this app's single-process, low-traffic deployment.
// Resets on process restart, which is acceptable given the login rate-limit's role
// (slow down brute force) rather than a durable security boundary.
const buckets = new Map<string, Bucket>();

export function checkLoginRateLimit(key: string): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket) return { allowed: true };

  if (bucket.lockedUntil && bucket.lockedUntil > now) {
    return { allowed: false, retryAfterMs: bucket.lockedUntil - now };
  }

  if (now - bucket.firstAttemptAt > WINDOW_MS) {
    buckets.delete(key);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.firstAttemptAt > WINDOW_MS) {
    buckets.set(key, { attempts: 1, firstAttemptAt: now });
    return;
  }

  bucket.attempts += 1;
  if (bucket.attempts >= MAX_ATTEMPTS) {
    bucket.lockedUntil = now + LOCKOUT_MS;
  }
}

export function clearLoginAttempts(key: string): void {
  buckets.delete(key);
}
