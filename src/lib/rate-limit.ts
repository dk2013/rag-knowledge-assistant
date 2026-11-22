// Rate limiting for the public demo. The app runs as one process, so an in-memory store is enough.
// Two limits: questions per visitor IP per hour (stops one bot from hammering the API), and questions per
// day for the whole site (caps the daily AI bill even if many IPs are used).
import { config } from "./config";

const HOUR_MS = 60 * 60 * 1000;

interface Store {
  perIp: Map<string, number[]>; // ip → timestamps of recent questions
  day: string; // UTC date the counter belongs to
  dayCount: number;
}

const g = globalThis as unknown as { rateLimitStore?: Store };
const store: Store = (g.rateLimitStore ??= { perIp: new Map<string, number[]>(), day: "", dayCount: 0 });

// Behind our nginx, X-Real-IP is set by the proxy to the real client address (it overwrites anything the
// client sends), and the app port is only reachable from localhost, so the header can be trusted.
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

export type LimitResult = { ok: true } | { ok: false; message: string; retryAfterSec: number };

// A trusted service sends "Authorization: Bearer <token>" with one of SERVICE_TOKENS.
export function isServiceCall(req: Request): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  return token.length > 0 && config.serviceTokens.includes(token);
}

export function checkRateLimit(ip: string, now = Date.now(), opts: { skipPerIp?: boolean } = {}): LimitResult {
  const today = new Date(now).toISOString().slice(0, 10);
  if (store.day !== today) {
    store.day = today;
    store.dayCount = 0;
  }

  if (config.dailyQuestionLimit > 0 && store.dayCount >= config.dailyQuestionLimit) {
    const midnight = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1);
    return {
      ok: false,
      message: "The demo has reached its daily question limit. Please come back tomorrow.",
      retryAfterSec: Math.ceil((midnight - now) / 1000),
    };
  }

  if (config.rateLimitPerIp > 0 && !opts.skipPerIp) {
    const recent = (store.perIp.get(ip) ?? []).filter((t) => now - t < HOUR_MS);
    if (recent.length >= config.rateLimitPerIp) {
      store.perIp.set(ip, recent);
      const retryAfterSec = Math.ceil((recent[0] + HOUR_MS - now) / 1000);
      return {
        ok: false,
        message: `The demo allows ${config.rateLimitPerIp} questions per hour. Please try again in ${Math.ceil(retryAfterSec / 60)} min.`,
        retryAfterSec,
      };
    }
    recent.push(now);
    store.perIp.set(ip, recent);
  }

  store.dayCount++;

  // Forget idle visitors so the map cannot grow without bound.
  if (store.perIp.size > 5000) {
    for (const [key, times] of store.perIp) if (!times.some((t) => now - t < HOUR_MS)) store.perIp.delete(key);
  }
  return { ok: true };
}
