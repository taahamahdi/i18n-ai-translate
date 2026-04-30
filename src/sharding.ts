/**
 * Greedy balance-by-item-count: assign each similarity group to the shard
 * whose running total is smallest. Groups stay whole, so related items
 * remain in one worker's chat history instead of being split across
 * unrelated context windows.
 */
export function buildGroupShards(
    groups: Array<{ [key: string]: string }>,
    concurrency: number,
): Array<{ [key: string]: string }> {
    const n = Math.max(1, concurrency);
    const shards: Array<{ [key: string]: string }> = Array.from(
        { length: n },
        () => ({}),
    );

    const counts: number[] = Array.from({ length: n }, () => 0);

    for (const group of groups) {
        let minIdx = 0;
        for (let i = 1; i < n; i++) {
            if (counts[i] < counts[minIdx]) minIdx = i;
        }

        for (const [k, v] of Object.entries(group)) {
            shards[minIdx][k] = v;
        }

        counts[minIdx] += Object.keys(group).length;
    }

    return shards.filter((shard) => Object.keys(shard).length > 0);
}
