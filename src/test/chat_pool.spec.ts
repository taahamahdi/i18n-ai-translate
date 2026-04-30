import ChatPool from "../chat_pool";
import Engine from "../enums/engine";
import RateLimiter from "../rate_limiter";

const mkPool = (concurrency: number): ChatPool =>
    ChatPool.create({
        chatParams: {} as any,
        concurrency,
        engine: Engine.ChatGPT,
        model: "gpt-4.1",
        rateLimiter: new RateLimiter(0, false),
    });

describe("ChatPool", () => {
    it("creates N triples and reports the correct size", () => {
        const pool = mkPool(3);
        expect(pool.size).toBe(3);
        expect(pool.all()).toHaveLength(3);
    });

    it("each triple contains three distinct chat instances", () => {
        const pool = mkPool(2);
        for (const triple of pool.all()) {
            expect(triple.generateTranslationChat).toBeDefined();
            expect(triple.verifyTranslationChat).toBeDefined();
            expect(triple.verifyStylingChat).toBeDefined();
            expect(triple.generateTranslationChat).not.toBe(
                triple.verifyTranslationChat,
            );
        }
    });

    it("different triples are distinct instances", () => {
        const pool = mkPool(3);
        const all = pool.all();
        expect(all[0].generateTranslationChat).not.toBe(
            all[1].generateTranslationChat,
        );

        expect(all[1].generateTranslationChat).not.toBe(
            all[2].generateTranslationChat,
        );
    });

    it("run() never hands the same triple to two concurrent tasks", async () => {
        const pool = mkPool(2);
        const inUse = new Set<unknown>();
        let maxConcurrent = 0;
        let active = 0;

        const task = (): Promise<void> =>
            pool.run(async (chats) => {
                expect(inUse.has(chats)).toBe(false);
                inUse.add(chats);
                active++;
                maxConcurrent = Math.max(maxConcurrent, active);
                // Yield once so other waiters get a chance to acquire.
                await Promise.resolve();
                active--;
                inUse.delete(chats);
            });

        await Promise.all([task(), task(), task(), task()]);
        expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it("serializes work beyond pool capacity", async () => {
        const pool = mkPool(1);
        const order: number[] = [];

        const task = (n: number): Promise<void> =>
            pool.run(async () => {
                order.push(n);
                await Promise.resolve();
            });

        await Promise.all([task(1), task(2), task(3)]);
        expect(order).toEqual([1, 2, 3]);
    });

    it("releases triples after errors so the pool does not deadlock", async () => {
        const pool = mkPool(1);

        await expect(
            pool.run(() => Promise.reject(new Error("boom"))),
        ).rejects.toThrow("boom");

        // Should still be acquirable after the failed task.
        await expect(pool.run(() => Promise.resolve("ok"))).resolves.toBe("ok");
    });
});
