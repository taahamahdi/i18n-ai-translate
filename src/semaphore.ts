/**
 * Run a list of async tasks with bounded concurrency.
 *
 * Unlike Promise.all(list.map(...)) this never schedules more than
 * `limit` tasks in flight at once — useful for fanning out over many
 * target languages without each one spinning up its own chat pool
 * before the first language has finished.
 *
 * When `limit` is 1 the behaviour collapses to serial execution,
 * matching the current default so existing workflows don't change.
 *
 * Errors are surfaced via Promise.allSettled semantics: every task
 * runs to completion, and the returned array preserves input order.
 */
export async function runWithConcurrency<T, R>(
    items: T[],
    limit: number,
    task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
    const effectiveLimit = Math.max(1, Math.floor(limit));
    const results: PromiseSettledResult<R>[] = new Array(items.length);
    let cursor = 0;

    const worker = async (): Promise<void> => {
        while (true) {
            const myIndex = cursor++;
            if (myIndex >= items.length) return;

            try {
                const value = await task(items[myIndex], myIndex);
                results[myIndex] = { status: "fulfilled", value };
            } catch (reason) {
                results[myIndex] = { reason, status: "rejected" };
            }
        }
    };

    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(effectiveLimit, items.length); i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
    return results;
}
