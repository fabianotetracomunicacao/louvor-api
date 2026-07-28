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

function isBlockedBody(body: string): boolean {
  return /captcha|recaptcha|cloudflare|cf-chl-|challenge|access denied|forbidden|robot check|rate limit|too many requests|"upstream_status"\s*:\s*(403|429)/i
    .test(body);
}

export function classifyUpstream(
  status: number,
  body: string,
): UpstreamClassification {
  if (status === 403 || status === 429 || isBlockedBody(body)) return "blocked";
  if (status === 408 || status === 425 || status >= 500) return "temporary";
  return "permanent";
}

export function nextRunAt(now: Date, random = Math.random): Date {
  const seconds = 30 + Math.floor(random() * 31);
  return new Date(now.getTime() + seconds * 1000);
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
