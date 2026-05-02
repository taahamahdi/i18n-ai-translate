import * as utils from "../utils";
import {
    extractRetryAfterMs,
    isRateLimitError,
    retryWithBackoff,
} from "../retry";
import RateLimiter from "../rate_limiter";

describe("isRateLimitError", () => {
    it("matches HTTP status 429", () => {
        expect(isRateLimitError({ status: 429 })).toBe(true);
    });

    it("matches Gemini RESOURCE_EXHAUSTED", () => {
        expect(
            isRateLimitError(new Error("RESOURCE_EXHAUSTED: quota exceeded")),
        ).toBe(true);
    });

    it("matches 'rate limit' in message", () => {
        expect(isRateLimitError(new Error("You've hit the rate limit"))).toBe(
            true,
        );
    });

    it("rejects unrelated errors", () => {
        expect(isRateLimitError(new Error("oops"))).toBe(false);
        expect(isRateLimitError({ status: 500 })).toBe(false);
        expect(isRateLimitError(null)).toBe(false);
        expect(isRateLimitError(undefined)).toBe(false);
    });
});

describe("extractRetryAfterMs", () => {
    it("parses Retry-After seconds", () => {
        expect(extractRetryAfterMs({ headers: { "retry-after": "3" } })).toBe(
            3_000,
        );
    });

    it("parses HTTP-date Retry-After", () => {
        const future = new Date(Date.now() + 5_000).toUTCString();
        const ms = extractRetryAfterMs({
            headers: { "retry-after": future },
        });

        expect(ms).not.toBeNull();
        expect(ms!).toBeGreaterThan(0);
        expect(ms!).toBeLessThanOrEqual(5_000);
    });

    it("returns null when no header", () => {
        expect(extractRetryAfterMs({})).toBeNull();
        expect(extractRetryAfterMs(new Error("no headers"))).toBeNull();
    });
});

describe("retryWithBackoff", () => {
    const mockedDelay = utils.delay as jest.MockedFunction<typeof utils.delay>;

    afterEach(() => {
        jest.clearAllMocks();
    });

    it("returns the job's value on first success", async () => {
        const job = jest.fn(() => Promise.resolve("ok"));
        const result = await retryWithBackoff(job, { maxRetries: 3 });

        expect(result).toBe("ok");
        expect(job).toHaveBeenCalledTimes(1);
        expect(mockedDelay).not.toHaveBeenCalled();
    });

    it("retries transient failures up to maxRetries", async () => {
        const job = jest
            .fn()
            .mockRejectedValueOnce(new Error("transient"))
            .mockRejectedValueOnce(new Error("transient"))
            .mockResolvedValueOnce("ok");

        const result = await retryWithBackoff(job, {
            baseDelayMs: 10,
            maxDelayMs: 1000,
            maxRetries: 3,
        });

        expect(result).toBe("ok");
        expect(job).toHaveBeenCalledTimes(3);
        expect(mockedDelay).toHaveBeenCalledTimes(2);
    });

    it("throws after exhausting retries", async () => {
        const job = jest.fn(() => Promise.reject(new Error("nope")));
        await expect(
            retryWithBackoff(job, { baseDelayMs: 1, maxRetries: 2 }),
        ).rejects.toThrow("nope");
        expect(job).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("honors Retry-After on 429 responses", async () => {
        const err = Object.assign(new Error("too many"), {
            headers: { "retry-after": "2" },
            status: 429,
        });

        const job = jest
            .fn()
            .mockRejectedValueOnce(err)
            .mockResolvedValueOnce("ok");

        await retryWithBackoff(job, { maxDelayMs: 60_000, maxRetries: 3 });

        expect(mockedDelay).toHaveBeenCalledWith(2_000);
    });

    it("caps Retry-After at maxDelayMs", async () => {
        const err = Object.assign(new Error("too many"), {
            headers: { "retry-after": "3600" },
            status: 429,
        });

        const job = jest
            .fn()
            .mockRejectedValueOnce(err)
            .mockResolvedValueOnce("ok");

        await retryWithBackoff(job, { maxDelayMs: 5_000, maxRetries: 3 });
        expect(mockedDelay).toHaveBeenCalledWith(5_000);
    });

    it("penalizes the shared rate limiter on 429", async () => {
        const rl = new RateLimiter(100, false);
        const penalize = jest.spyOn(rl, "penalize");

        const err = Object.assign(new Error("429"), {
            headers: { "retry-after": "1" },
            status: 429,
        });

        const job = jest
            .fn()
            .mockRejectedValueOnce(err)
            .mockResolvedValueOnce("ok");

        await retryWithBackoff(job, {
            maxRetries: 3,
            rateLimiter: rl,
        });

        expect(penalize).toHaveBeenCalledWith(1_000);
    });

    it("does not penalize on non-rate-limit errors", async () => {
        const rl = new RateLimiter(100, false);
        const penalize = jest.spyOn(rl, "penalize");

        const job = jest
            .fn()
            .mockRejectedValueOnce(new Error("500"))
            .mockResolvedValueOnce("ok");

        await retryWithBackoff(job, {
            baseDelayMs: 1,
            maxRetries: 3,
            rateLimiter: rl,
        });

        expect(penalize).not.toHaveBeenCalled();
    });
});
