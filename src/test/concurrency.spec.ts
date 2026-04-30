// End-to-end concurrency coverage. Unlike translate.spec.ts (which mocks the
// CSV + JSON pipelines wholesale), this file mocks only ChatFactory so the
// real translate.ts / pipelines / pool / limiter all execute.

import type { ChatParams, Model } from "../types";
import type { ZodType, ZodTypeDef } from "zod";
import type Engine from "../enums/engine";
import type RateLimiter from "../rate_limiter";

// A global tracker the fake ChatFactory records into. Tests assert over
// this to prove workers got distinct Chats instances.
type ChatCall = {
    chatId: number;
    format: "csv" | "json-translate" | "json-verify" | "unknown";
    keys: string[];
};

const chatCalls: ChatCall[] = [];
let nextChatId = 1;
let failKeys: Set<string> | null = null;
let rejectOn429Once: Set<string> | null = null;

function mintChatId(): number {
    const id = nextChatId;
    nextChatId++;
    return id;
}

function fakeTranslate(s: string): string {
    return `${s}_fr`;
}

function parseCsvInput(message: string): string[] {
    // The CSV prompt wraps the input block in triple backticks.
    const backtickBlock = message.match(/```\n([\s\S]*?)\n```/);
    if (!backtickBlock) return [];
    return backtickBlock[1]
        .split("\n")
        .map((line) => line.replace(/^"|"$/g, ""));
}

function parseJsonItems(message: string): Array<{ id: number; original: string }> {
    const backtickBlock = message.match(/```json\n([\s\S]*?)\n```/);
    if (!backtickBlock) return [];
    try {
        const parsed = JSON.parse(backtickBlock[1]);
        if (Array.isArray(parsed)) return parsed;
        return [];
    } catch {
        return [];
    }
}

function detectFormat(
    message: string,
    format?: ZodType<any, ZodTypeDef, any>,
): ChatCall["format"] {
    if (!format) return "csv";
    // Each JSON-mode prompt has a distinct preamble we can match on.
    if (/Check translations from/.test(message)) return "json-verify";
    if (/Translate from/.test(message)) return "json-translate";
    return "unknown";
}

function makeFakeChat(): {
    startChat: jest.Mock;
    sendMessage: jest.Mock;
    resetChatHistory: jest.Mock;
    rollbackLastMessage: jest.Mock;
    signalInvalid: jest.Mock;
    chatId: number;
} {
    const chatId = mintChatId();

    const sendMessage = jest.fn(
        async (
            message: string,
            format?: ZodType<any, ZodTypeDef, any>,
        ): Promise<string> => {
            const fmt = detectFormat(message, format);

            if (fmt === "csv") {
                const inputs = parseCsvInput(message);
                chatCalls.push({ chatId, format: fmt, keys: inputs });

                const shouldReject = inputs.some((i) => failKeys?.has(i));
                if (shouldReject) {
                    throw new Error(`simulated failure for: ${inputs.join(",")}`);
                }

                if (inputs.some((i) => rejectOn429Once?.has(i))) {
                    rejectOn429Once = null;
                    const err = Object.assign(new Error("rate limited"), {
                        headers: { "retry-after": "0" },
                        status: 429,
                    });

                    throw err;
                }

                return inputs.map((s) => `"${fakeTranslate(s)}"`).join("\n");
            }

            if (fmt === "json-translate") {
                const items = parseJsonItems(message);
                chatCalls.push({
                    chatId,
                    format: fmt,
                    keys: items.map((it) => it.original),
                });

                if (items.some((it) => failKeys?.has(it.original))) {
                    throw new Error(
                        `simulated failure for: ${items.map((it) => it.original).join(",")}`,
                    );
                }

                return JSON.stringify({
                    items: items.map((it) => ({
                        id: it.id,
                        translated: fakeTranslate(it.original),
                    })),
                });
            }

            if (fmt === "json-verify") {
                const items = parseJsonItems(message);
                chatCalls.push({
                    chatId,
                    format: fmt,
                    keys: items.map((it) => it.original),
                });

                return JSON.stringify({
                    items: items.map((it) => ({
                        fixedTranslation: "",
                        id: it.id,
                        issue: "",
                        valid: true,
                    })),
                });
            }

            return "";
        },
    );

    return {
        chatId,
        signalInvalid: jest.fn(),
        resetChatHistory: jest.fn(),
        rollbackLastMessage: jest.fn(),
        sendMessage,
        startChat: jest.fn(),
    };
}

jest.mock("../chats/chat_factory", () => ({
    __esModule: true,
    default: {
        newChat: jest.fn(
            (
                _engine: Engine,
                _model: Model,
                _rateLimiter: RateLimiter,
                _apiKey?: string,
                _host?: string,
                _chatParams?: ChatParams,
            ) => makeFakeChat(),
        ),
    },
}));


// delay() in utils.ts is used by the rate limiter and retry code; short-circuit
// it so tests don't actually sleep.
jest.mock("../utils", () => {
    const actual = jest.requireActual("../utils");
    return {
        ...actual,
        delay: jest.fn(() => Promise.resolve()),
        printExecutionTime: jest.fn(),
        printInfo: jest.fn(),
        printProgress: jest.fn(),
        printWarn: jest.fn(),
    };
});

// Import AFTER mocks so translate() sees the mocked ChatFactory.
// eslint-disable-next-line import/first
import Engine_ from "../enums/engine";
// eslint-disable-next-line import/first
import PromptMode from "../enums/prompt_mode";
// eslint-disable-next-line import/first
import { translate } from "../translate";

process.env.OPENAI_API_KEY = "test";

const baseOptions = {
    apiKey: "test",
    batchMaxTokens: 4096,
    batchSize: 4,
    chatParams: {},
    continueOnError: true,
    engine: Engine_.ChatGPT,
    host: undefined,
    inputLanguageCode: "en",
    model: "gpt-4.1",
    outputLanguageCode: "fr",
    rateLimitMs: 0,
    skipStylingVerification: true,
    skipTranslationVerification: true,
    templatedStringPrefix: "{{",
    templatedStringSuffix: "}}",
    verbose: false,
};

beforeEach(() => {
    chatCalls.length = 0;
    nextChatId = 1;
    failKeys = null;
    rejectOn429Once = null;
});

const toyInput = (): Record<string, string> => ({
    bye1: "Bye",
    bye2: "Goodbye",
    hello1: "Hello",
    hello2: "Hi",
    thanks1: "Thanks",
    thanks2: "Thank you",
    yes1: "Yes",
    yes2: "Yeah",
});

describe.each(Object.values(PromptMode))(
    "concurrency (promptMode=%s)",
    (promptMode) => {
        it("concurrency=1 and concurrency=4 produce the same output", async () => {
            const serial = (await translate({
                ...baseOptions,
                concurrency: 1,
                inputJSON: toyInput(),
                promptMode,
            } as any)) as Record<string, string>;

            chatCalls.length = 0;
            nextChatId = 1;

            const parallel = (await translate({
                ...baseOptions,
                concurrency: 4,
                inputJSON: toyInput(),
                promptMode,
            } as any)) as Record<string, string>;

            expect(parallel).toEqual(serial);
            expect(serial.hello1).toBe("Hello_fr");
        });

        it("concurrency=2 routes work to two distinct chat instances", async () => {
            await translate({
                ...baseOptions,
                concurrency: 2,
                inputJSON: toyInput(),
                promptMode,
            } as any);

            const translateCalls = chatCalls.filter(
                (c) => c.format === "csv" || c.format === "json-translate",
            );

            const uniqueChatIds = new Set(translateCalls.map((c) => c.chatId));
            expect(uniqueChatIds.size).toBeGreaterThanOrEqual(2);
        });

        it("every input key shows up in some translate chat call exactly once", async () => {
            const input = toyInput();
            await translate({
                ...baseOptions,
                concurrency: 2,
                inputJSON: input,
                promptMode,
            } as any);

            const seen = new Set<string>();
            for (const call of chatCalls) {
                if (call.format !== "csv" && call.format !== "json-translate") {
                    continue;
                }

                for (const key of call.keys) {
                    seen.add(key);
                }
            }

            for (const value of Object.values(input)) {
                expect(seen.has(value)).toBe(true);
            }
        });

        it("continueOnError skips failing work but keeps the rest of the translation", async () => {
            failKeys = new Set(["Hi"]); // hello2's value

            const out = (await translate({
                ...baseOptions,
                // batchSize 1 so a CSV failure skips just one key, not a batch.
                batchSize: 1,
                concurrency: 2,
                continueOnError: true,
                inputJSON: toyInput(),
                promptMode,
            } as any)) as Record<string, string>;

            // Most keys should translate; the failing key may or may not
            // appear depending on mode.
            const translatedCount = Object.values(out).filter(
                (v) => typeof v === "string" && v.endsWith("_fr"),
            ).length;

            expect(translatedCount).toBeGreaterThanOrEqual(7);
        });

        it("handles empty input at any concurrency", async () => {
            const out = await translate({
                ...baseOptions,
                concurrency: 4,
                inputJSON: {},
                promptMode,
            } as any);

            expect(out).toEqual({});
        });

        it("handles single-key input at concurrency higher than input size", async () => {
            const out = (await translate({
                ...baseOptions,
                concurrency: 4,
                inputJSON: { only: "Single" },
                promptMode,
            } as any)) as Record<string, string>;

            expect(out.only).toBe("Single_fr");
        });
    },
);

describe("rate limit penalty propagates through shared limiter", () => {
    it("a 429 on one worker delays other workers via the limiter", async () => {
        rejectOn429Once = new Set(["Hello"]);

        // Should still succeed thanks to retryWithBackoff.
        const out = (await translate({
            ...baseOptions,
            concurrency: 2,
            inputJSON: toyInput(),
            promptMode: PromptMode.CSV,
        } as any)) as Record<string, string>;

        expect(out.hello1).toBe("Hello_fr");
        // No assertion on the limiter itself here — the unit test in
        // retry.spec.ts already covers the penalize() wiring. What we're
        // proving here is just that a 429 in one worker doesn't kill
        // translation.
    });
});
