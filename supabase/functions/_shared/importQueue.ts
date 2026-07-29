export type UpstreamClassification = "blocked" | "temporary" | "permanent";

export function normalizeIdentity(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function structuredError(body: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null &&
        !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isBlockedError(body: string): boolean {
  const error = structuredError(body);
  if (!error) return false;

  const upstreamStatus = Number(error.upstream_status);
  if (
    error.blocked === true || upstreamStatus === 403 || upstreamStatus === 429
  ) {
    return true;
  }

  return typeof error.error === "string" &&
    /captcha|recaptcha|cloudflare|cf-chl-|challenge|access denied|forbidden|robot check|rate limit|too many requests/i
      .test(error.error);
}

function isPermanentError(body: string): boolean {
  const error = structuredError(body);
  return error?.error_code === "missing_canonical_metadata";
}

export function classifyUpstream(
  status: number,
  body: string,
): UpstreamClassification {
  if (status === 403 || status === 429 || isBlockedError(body)) {
    return "blocked";
  }
  if (isPermanentError(body)) return "permanent";
  if (status === 408 || status === 425 || status >= 500) return "temporary";
  return "permanent";
}

export function nextRunAt(now: Date, random = Math.random): Date {
  const seconds = 30 + Math.floor(random() * 31);
  return new Date(now.getTime() + seconds * 1000);
}

export function blockedRunAt(now: Date): Date {
  return new Date(now.getTime() + 10 * 60 * 1000);
}

export function retryRunAt(
  now: Date,
  attempts: number,
  random = Math.random,
): Date {
  const normalizedAttempts = Math.max(1, Math.floor(attempts));
  const multiplier = Math.min(2 ** (normalizedAttempts - 1), 32);
  const seconds = Math.min(
    (30 + Math.floor(random() * 31)) * multiplier,
    30 * 60,
  );
  return new Date(now.getTime() + seconds * 1000);
}
