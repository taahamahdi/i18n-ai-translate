// Correctness coverage for check mode. Stubs ChatFactory so we can
// control what the "verifier" returns for each item and assert the
// report structure.

import type { ChatParams, Model } from "../types";
import type { ZodType, ZodTypeDef } from "zod";
import type Engine from "../enums/engine";
import type RateLimiter from "../rate_limiter";

// Per-test knobs the stub reads. Map from the translated value to
// whatever verify-output shape we want the model to "return".
type Verdict = { valid: boolean; fixedTranslation?: string; issue?: string };
let verdicts: Map<string, Verdict> = new Map();

function makeFakeChat(): {
    startChat: jest.Mock;
    sendMessage: jest.Mock;
    resetChatHistory: jest.Mock;
    rollbackLastMessage: jest.Mock;
    signalInvalid: jest.Mock;
} {
    const sendMessage = jest.fn(
        async (
            message: string,
            format?: ZodType<any, ZodTypeDef, any>,
        ): Promise<string> => {
            if (!format) return "ACK";

            // Parse the verify-prompt's backticked JSON block.
            const block = message.match(/```json\n([\s\S]*?)\n```/);
            if (!block) return "";
            type Item = { id: number; original: string; translated: string };
            const items = JSON.parse(block[1]) as Item[];

            const results = items.map((it) => {
                const verdict = verdicts.get(it.translated) ?? { valid: true };
                return {
                    fixedTranslation: verdict.fixedTranslation ?? "",
                    id: it.id,
                    issue: verdict.issue ?? "",
                    valid: verdict.valid,
                };
            });

            return JSON.stringify({ items: results });
        },
    );

    return {
        resetChatHistory: jest.fn(),
        rollbackLastMessage: jest.fn(),
        sendMessage,
        signalInvalid: jest.fn(),
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

// eslint-disable-next-line import/first
import Engine_ from "../enums/engine";
// eslint-disable-next-line import/first
import PromptMode from "../enums/prompt_mode";
// eslint-disable-next-line import/first
import { check } from "../check";

process.env.OPENAI_API_KEY = "test";

const baseCheckOptions = {
    apiKey: "test",
    batchMaxTokens: 4096,
    batchSize: 4,
    chatParams: {},
    concurrency: 1,
    continueOnError: true,
    engine: Engine_.ChatGPT,
    inputLanguageCode: "en",
    model: "gpt-4.1",
    outputLanguageCode: "fr",
    promptMode: PromptMode.JSON,
    rateLimitMs: 0,
    templatedStringPrefix: "{{",
    templatedStringSuffix: "}}",
    verbose: false,
};

beforeEach(() => {
    verdicts = new Map();
});

describe("check mode", () => {
    it("returns an empty report when every translation passes verification", async () => {
        // Default verdict is { valid: true } for every translated value.
        const report = await check({
            ...baseCheckOptions,
            inputJSON: { greeting: "Hello", thanks: "Thanks" },
            targetJSON: { greeting: "Bonjour", thanks: "Merci" },
        } as any);

        expect(report.issues).toEqual([]);
        expect(report.totalKeys).toBe(2);
        expect(report.languageCode).toBe("fr");
    });

    it("surfaces keys the verifier flags as invalid", async () => {
        verdicts.set("Bad", {
            fixedTranslation: "Bien",
            issue: "This is a completely wrong translation",
            valid: false,
        });

        const report = await check({
            ...baseCheckOptions,
            inputJSON: { good: "Good", bad: "Bad_source" },
            targetJSON: { good: "Bien", bad: "Bad" },
        } as any);

        expect(report.issues).toHaveLength(1);
        expect(report.issues[0]).toMatchObject({
            issue: "This is a completely wrong translation",
            key: "bad",
            original: "Bad_source",
            suggestion: "Bien",
            translated: "Bad",
        });
    });

    it("does NOT rewrite or accept fixes — flagged items stay in the report", async () => {
        // Previously checkJSON routed through generateVerificationJSON
        // which "fixed" the item and returned failure="". Under the
        // corrected path the caller sees the issue regardless of what
        // fixedTranslation was.
        verdicts.set("Wrong", {
            fixedTranslation: "Fixed",
            issue: "wrong",
            valid: false,
        });

        const report = await check({
            ...baseCheckOptions,
            inputJSON: { only: "Only_source" },
            targetJSON: { only: "Wrong" },
        } as any);

        expect(report.issues).toHaveLength(1);
        expect(report.issues[0].translated).toBe("Wrong");
        expect(report.issues[0].suggestion).toBe("Fixed");
    });

    it("skips keys missing from the target file", async () => {
        verdicts.set("Bad", { issue: "no good", valid: false });

        const report = await check({
            ...baseCheckOptions,
            inputJSON: { a: "A", b: "B", c: "C" },
            targetJSON: { a: "Bad" /* b and c missing */ },
        } as any);

        expect(report.totalKeys).toBe(1);
        expect(report.issues).toHaveLength(1);
        expect(report.issues[0].key).toBe("a");
    });

    it("handles a mix of valid and invalid items in one batch", async () => {
        verdicts.set("Wrong1", { issue: "no", valid: false });
        verdicts.set("Wrong2", { issue: "also no", valid: false });
        // Good1, Good2 default to valid: true.

        const report = await check({
            ...baseCheckOptions,
            inputJSON: { k1: "K1", k2: "K2", k3: "K3", k4: "K4" },
            targetJSON: {
                k1: "Good1",
                k2: "Wrong1",
                k3: "Good2",
                k4: "Wrong2",
            },
        } as any);

        expect(report.issues.map((i) => i.key).sort()).toEqual(["k2", "k4"]);
    });
});
