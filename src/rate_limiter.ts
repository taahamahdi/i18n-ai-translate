import { delay, printInfo } from "./utils";

const ONE_MINUTE_MS = 60_000;

export default class RateLimiter {
    lastAPICall: number | null;

    delayBetweenCallsMs: number;

    verboseLogging: boolean;

    /** Optional tokens-per-minute cap enforced alongside the RPM slot. */
    tokensPerMinute?: number;

    private nextSlot: number;

    /**
     * Sliding 60-second window of recent token consumption. Each entry
     * is [unix-millis-at-consume-time, token-count]. Entries older than
     * 60s are pruned on every acquire() call.
     */
    private tokenWindow: Array<[number, number]>;

    constructor(
        delayBetweenCallsMs: number,
        verboseLogging: boolean,
        tokensPerMinute?: number,
    ) {
        this.lastAPICall = null;
        this.delayBetweenCallsMs = delayBetweenCallsMs;
        this.verboseLogging = verboseLogging;
        this.tokensPerMinute = tokensPerMinute;
        this.nextSlot = 0;
        this.tokenWindow = [];
    }

    /**
     * Reserve the next RPM slot and, when configured, also wait for
     * enough TPM headroom to fit the estimated token cost of the call
     * about to be made. Concurrent callers reserve distinct slots
     * synchronously; the TPM check runs afterward.
     * @param estimatedTokens - tokens this call is expected to consume; 0 skips the TPM check
     */
    async acquire(estimatedTokens = 0): Promise<void> {
        // RPM slot reservation. The read-and-bump must happen in one
        // synchronous turn — no await between — so concurrent callers
        // each reserve a distinct slot spaced by delayBetweenCallsMs.
        const now = Date.now();
        const slot = Math.max(now, this.nextSlot);
        this.nextSlot = slot + this.delayBetweenCallsMs;
        this.lastAPICall = slot;

        const timeToWait = slot - now;
        if (timeToWait > 0) {
            if (this.verboseLogging) {
                printInfo(
                    `\nRateLimiter | Waiting ${timeToWait}ms before next API call`,
                );
            }

            await delay(timeToWait);
        }

        if (this.tokensPerMinute && estimatedTokens > 0) {
            await this.awaitTokenBudget(estimatedTokens);
        }
    }

    /**
     * TPM enforcement. Prunes stale entries, and if adding this call
     * would exceed the cap, waits until the oldest entry is old enough
     * to fall out of the 60-second window.
     */
    private async awaitTokenBudget(estimatedTokens: number): Promise<void> {
        if (!this.tokensPerMinute) return;

        // Paying more than the minute-wide cap in a single call is
        // impossible to satisfy; still consume it, but log loudly so
        // the user knows it'll likely 429.
        if (estimatedTokens >= this.tokensPerMinute) {
            if (this.verboseLogging) {
                printInfo(
                    `\nRateLimiter | Single call estimated at ${estimatedTokens} tokens exceeds TPM cap of ${this.tokensPerMinute}; dispatching anyway`,
                );
            }

            this.tokenWindow.push([Date.now(), estimatedTokens]);
            return;
        }

        // Potentially loop: the wait might have to repeat if other
        // concurrent callers consumed the budget while we were asleep.
        // Each iteration prunes first, then either fires or sleeps
        // until the oldest relevant entry ages out.
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const now = Date.now();
            this.tokenWindow = this.tokenWindow.filter(
                ([ts]) => now - ts < ONE_MINUTE_MS,
            );

            const inFlight = this.tokenWindow.reduce(
                (sum, [, t]) => sum + t,
                0,
            );

            if (inFlight + estimatedTokens <= this.tokensPerMinute) {
                this.tokenWindow.push([now, estimatedTokens]);
                return;
            }

            // Sleep until the earliest in-window entry falls out, then
            // re-check. The window is sorted by insertion order so
            // tokenWindow[0] is the oldest.
            const oldest = this.tokenWindow[0][0];
            const waitMs = Math.max(1, ONE_MINUTE_MS - (now - oldest));
            if (this.verboseLogging) {
                printInfo(
                    `\nRateLimiter | TPM cap reached (${inFlight}/${this.tokensPerMinute}), waiting ${waitMs}ms for budget`,
                );
            }

            // eslint-disable-next-line no-await-in-loop
            await delay(waitMs);
        }
    }

    penalize(penaltyMs: number): void {
        // A 429 from any worker pushes the shared slot forward so every
        // other in-flight worker backs off too.
        const target = Date.now() + penaltyMs;
        if (target > this.nextSlot) this.nextSlot = target;
    }

    apiCalled(): void {
        this.lastAPICall = Date.now();
    }

    async wait(): Promise<void> {
        if (this.lastAPICall) {
            const timeToWait =
                this.delayBetweenCallsMs - (Date.now() - this.lastAPICall);

            if (timeToWait > 0) {
                if (this.verboseLogging) {
                    printInfo(
                        `\nRateLimiter | Waiting ${timeToWait}ms before next API call`,
                    );
                }

                await delay(timeToWait);
            }
        }
    }
}
