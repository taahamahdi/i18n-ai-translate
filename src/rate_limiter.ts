import { delay } from "./utils";

export default class RateLimiter {
    lastAPICall: number | null;

    delayBetweenCallsMs: number;

    constructor(delayBetweenCallsMs: number) {
        this.lastAPICall = null;
        this.delayBetweenCallsMs = delayBetweenCallsMs;
    }

    apiCalled(): void {
        this.lastAPICall = Date.now();
    }

    async wait(): Promise<void> {
        if (this.lastAPICall) {
            await delay(
                this.delayBetweenCallsMs - (Date.now() - this.lastAPICall),
            );
        }

        return Promise.resolve();
    }
}
