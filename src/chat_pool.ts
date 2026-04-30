import ChatFactory from "./chats/chat_factory";
import type { ChatParams, Model } from "./types";
import type Chats from "./interfaces/chats";
import type Engine from "./enums/engine";
import type RateLimiter from "./rate_limiter";

type PoolOptions = {
    engine: Engine;
    model: Model;
    rateLimiter: RateLimiter;
    apiKey?: string;
    host?: string;
    chatParams?: ChatParams;
    concurrency: number;
};

export default class ChatPool {
    readonly rateLimiter: RateLimiter;

    private available: Chats[];

    private waiters: Array<(c: Chats) => void>;

    private readonly slots: Chats[];

    private constructor(triples: Chats[], rateLimiter: RateLimiter) {
        this.slots = triples;
        this.available = [...triples];
        this.waiters = [];
        this.rateLimiter = rateLimiter;
    }

    static create(options: PoolOptions): ChatPool {
        const triples: Chats[] = [];
        for (let i = 0; i < options.concurrency; i++) {
            triples.push({
                generateTranslationChat: ChatFactory.newChat(
                    options.engine,
                    options.model,
                    options.rateLimiter,
                    options.apiKey,
                    options.host,
                    options.chatParams,
                ),
                verifyStylingChat: ChatFactory.newChat(
                    options.engine,
                    options.model,
                    options.rateLimiter,
                    options.apiKey,
                    options.host,
                    options.chatParams,
                ),
                verifyTranslationChat: ChatFactory.newChat(
                    options.engine,
                    options.model,
                    options.rateLimiter,
                    options.apiKey,
                    options.host,
                    options.chatParams,
                ),
            });
        }

        return new ChatPool(triples, options.rateLimiter);
    }

    get size(): number {
        return this.slots.length;
    }

    /** Returns every triple, in order. Used for per-worker sharding. */
    all(): Chats[] {
        return [...this.slots];
    }

    async run<T>(fn: (chats: Chats) => Promise<T>): Promise<T> {
        const chats = await this.acquire();
        try {
            return await fn(chats);
        } finally {
            this.release(chats);
        }
    }

    private acquire(): Promise<Chats> {
        return new Promise((resolve) => {
            const chats = this.available.pop();
            if (chats) {
                resolve(chats);
            } else {
                this.waiters.push(resolve);
            }
        });
    }

    private release(chats: Chats): void {
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter(chats);
        } else {
            this.available.push(chats);
        }
    }
}
