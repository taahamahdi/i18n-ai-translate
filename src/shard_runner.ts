import { buildGroupShards } from "./sharding";
import type ChatPool from "./chat_pool";
import type Chats from "./interfaces/chats";

type ShardWorker<T> = (shard: { [key: string]: string }, chats: Chats) => Promise<T>;

/**
 * Share the "build shards, assign a pool triple, run in parallel"
 * scaffold that both pipelines need. The pipeline supplies only the
 * per-shard body via `work`.
 *
 * Groups stay whole within a shard so each worker's chat history
 * accumulates related items. `concurrency` is implicit in `pool.size`.
 */
export async function runAcrossShards<T>(
    flatInput: { [key: string]: string },
    groups: Array<{ [key: string]: string }>,
    pool: ChatPool,
    work: ShardWorker<T>,
): Promise<T[]> {
    const groupShards = buildGroupShards(groups, pool.size);
    const shards = groupShards.length > 0 ? groupShards : [flatInput];
    const triples = pool.all();

    return Promise.all(
        shards.map((shard, shardIdx) =>
            work(shard, triples[shardIdx % triples.length]),
        ),
    );
}
