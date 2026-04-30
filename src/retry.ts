import { delay, printWarn } from "./utils";
import type RateLimiter from "./rate_limiter";

export type RetryWithBackoffOptions = {
    maxRetries: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    rateLimiter?: RateLimiter;
    verbose?: boolean;
};

const DEFAULT_BASE_DELAY_MS = 1_000;
const DEFAULT_MAX_DELAY_MS = 60_000;

/** Detects provider rate-limit errors across OpenAI, Anthropic, and Gemini shapes. */
export function isRateLimitError(err: unknown): boolean {
    if (err === null || typeof err !== "object") return false;
    const anyErr = err as { status?: number; message?: string };
    if (anyErr.status === 429) return true;
    if (typeof anyErr.message === "string") {
        if (/\b429\b/.test(anyErr.message)) return true;
        if (/rate[ _-]?limit/i.test(anyErr.message)) return true;
        if (/RESOURCE_EXHAUSTED/.test(anyErr.message)) return true;
    }

    return false;
}

/** Reads a Retry-After header (seconds or HTTP-date) off an SDK error. */
export function extractRetryAfterMs(err: unknown): number | null {
    if (err === null || typeof err !== "object") return null;
    const headers = (err as { headers?: Record<string, string> }).headers;
    if (!headers) return null;
    const raw = headers["retry-after"] ?? headers["Retry-After"];
    if (!raw) return null;

    const seconds = Number(raw);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const asDate = Date.parse(raw);
    if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());

    return null;
}

function computeBackoffMs(
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number,
): number {
    const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
    return Math.floor(Math.random() * exponential);
}

/** Retries `job` with full-jitter exponential backoff; penalizes the shared limiter on 429s. */
export async function retryWithBackoff<T>(
    job: () => Promise<T>,
    options: RetryWithBackoffOptions,
): Promise<T> {
    const {
        maxRetries,
        baseDelayMs = DEFAULT_BASE_DELAY_MS,
        maxDelayMs = DEFAULT_MAX_DELAY_MS,
        rateLimiter,
        verbose,
    } = options;

    let attempt = 0;
    while (true) {
        try {
            return await job();
        } catch (err) {
            if (attempt >= maxRetries) throw err;

            const rateLimited = isRateLimitError(err);
            const retryAfter = extractRetryAfterMs(err);
            const computed = computeBackoffMs(attempt, baseDelayMs, maxDelayMs);
            const waitMs = Math.min(
                maxDelayMs,
                retryAfter !== null ? retryAfter : computed,
            );

            if (rateLimited && rateLimiter) {
                rateLimiter.penalize(waitMs);
            }

            if (verbose) {
                printWarn(
                    `Retry ${attempt + 1}/${maxRetries} after ${waitMs}ms (${
                        rateLimited ? "rate-limited" : "error"
                    }): ${err}`,
                );
            }

            await delay(waitMs);
            attempt++;
        }
    }
}
