import { buildGroupShards } from "../sharding";

describe("buildGroupShards", () => {
    it("keeps each group whole within a single shard", () => {
        const groups: Array<Record<string, string>> = [
            { a: "Hello", b: "Hi" },
            { c: "Goodbye", d: "Bye" },
            { e: "Thanks" },
        ];

        const shards = buildGroupShards(groups, 2);
        // Collect which keys ended up together.
        const locate = (key: string): number =>
            shards.findIndex((shard) => key in shard);

        // Keys in the same group are in the same shard.
        expect(locate("a")).toBe(locate("b"));
        expect(locate("c")).toBe(locate("d"));
    });

    it("balances by item count greedily across shards", () => {
        const groups: Array<Record<string, string>> = [
            { a: "1", b: "2", c: "3" }, // 3
            { d: "4" }, // 1
            { e: "5" }, // 1
            { f: "6" }, // 1
        ];

        const shards = buildGroupShards(groups, 2);
        const counts = shards.map((s) => Object.keys(s).length);
        counts.sort();
        expect(counts).toEqual([3, 3]);
    });

    it("drops empty shards when groups < concurrency", () => {
        const groups: Array<Record<string, string>> = [{ a: "1" }, { b: "2" }];

        const shards = buildGroupShards(groups, 5);
        expect(shards).toHaveLength(2);
        for (const shard of shards) {
            expect(Object.keys(shard).length).toBeGreaterThan(0);
        }
    });

    it("handles concurrency=1 by putting everything in one shard", () => {
        const groups: Array<Record<string, string>> = [
            { a: "1" },
            { b: "2" },
            { c: "3" },
        ];

        const shards = buildGroupShards(groups, 1);
        expect(shards).toHaveLength(1);
        expect(Object.keys(shards[0])).toEqual(["a", "b", "c"]);
    });
});
