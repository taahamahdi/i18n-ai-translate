import { ANSIStyles } from "./print_styles";
import { delay } from "./utils";

export default class RateLimiter {
    lastAPICall: number | null;

    delayBetweenCallsMs: number;

    verboseLogging: boolean;

    constructor(delayBetweenCallsMs: number, verboseLogging: boolean) {
        this.lastAPICall = null;
        this.delayBetweenCallsMs = delayBetweenCallsMs;
        this.verboseLogging = verboseLogging;
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
                    console.info(
                        ANSIStyles.bright,
                        ANSIStyles.fg.cyan,
                        `RateLimiter | Waiting ${timeToWait}ms before next API call`,
                        ANSIStyles.reset,
                    );
                }

                await delay(timeToWait);
            }
        }
    }
}
