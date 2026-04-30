import { delay, printInfo } from "./utils";

export default class RateLimiter {
    lastAPICall: number | null;

    delayBetweenCallsMs: number;

    verboseLogging: boolean;

    private nextSlot: number;

    constructor(delayBetweenCallsMs: number, verboseLogging: boolean) {
        this.lastAPICall = null;
        this.delayBetweenCallsMs = delayBetweenCallsMs;
        this.verboseLogging = verboseLogging;
        this.nextSlot = 0;
    }

    async acquire(): Promise<void> {
        // Read-and-bump happens in one synchronous turn, so concurrent
        // callers each reserve a distinct slot spaced by delayBetweenCallsMs.
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
