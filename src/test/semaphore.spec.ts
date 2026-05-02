import { runWithConcurrency } from "../semaphore";

describe("runWithConcurrency", () => {
    it("executes all tasks and preserves input order in the results", async () => {
        const results = await runWithConcurrency(
            [1, 2, 3, 4, 5],
            2,
            async (n) => n * 10,
        );

        expect(
            results.map((r) => (r as PromiseFulfilledResult<number>).value),
        ).toEqual([10, 20, 30, 40, 50]);
    });

    it("never has more than `limit` tasks in flight at once", async () => {
        let active = 0;
        let maxActive = 0;

        await runWithConcurrency(
            Array.from({ length: 12 }, (_, i) => i),
            3,
            async () => {
                active++;
                maxActive = Math.max(maxActive, active);
                await Promise.resolve();
                active--;
            },
        );

        expect(maxActive).toBeLessThanOrEqual(3);
    });

    it("limit=1 runs tasks strictly sequentially", async () => {
        const order: number[] = [];
        await runWithConcurrency([1, 2, 3], 1, async (n) => {
            order.push(n);
            await Promise.resolve();
        });

        expect(order).toEqual([1, 2, 3]);
    });

    it("rejected tasks do not stop other tasks from running", async () => {
        const results = await runWithConcurrency([1, 2, 3], 2, async (n) => {
            if (n === 2) throw new Error("boom");
            return n;
        });

        expect(results[0]).toEqual({ status: "fulfilled", value: 1 });
        expect(results[1].status).toBe("rejected");
        expect(results[2]).toEqual({ status: "fulfilled", value: 3 });
    });

    it("handles empty input without deadlocking", async () => {
        const results = await runWithConcurrency([], 4, async () => {
            throw new Error("should never run");
        });

        expect(results).toEqual([]);
    });

    it("clamps limit to at least 1", async () => {
        const order: number[] = [];
        await runWithConcurrency([1, 2, 3], 0, async (n) => {
            order.push(n);
        });

        expect(order).toEqual([1, 2, 3]);
    });
});
