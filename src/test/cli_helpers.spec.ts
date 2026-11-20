// Focused coverage for processModelArgs — exercises the per-engine
// defaults and the --tokens-per-minute parser in isolation.

import { processModelArgs } from "../cli_helpers";
import Engine from "../enums/engine";

process.env.OPENAI_API_KEY = "test";
process.env.ANTHROPIC_API_KEY = "test";
process.env.GEMINI_API_KEY = "test";

describe("processModelArgs tokensPerMinute", () => {
    it("defaults to undefined (no cap) for every engine", () => {
        // The TPM cap is opt-in: mistakenly throttling a paid-tier user
        // is worse than relying on RPM + provider 429s for free-tier.
        for (const engine of [
            Engine.ChatGPT,
            Engine.Claude,
            Engine.Gemini,
            Engine.Ollama,
        ]) {
            const args = processModelArgs({ engine });
            expect(args.tokensPerMinute).toBeUndefined();
        }
    });

    it("honors a user-supplied --tokens-per-minute value", () => {
        const args = processModelArgs({
            engine: Engine.ChatGPT,
            tokensPerMinute: "50000",
        });

        expect(args.tokensPerMinute).toBe(50000);
    });

    it("treats --tokens-per-minute 0 as explicitly disabling the cap", () => {
        const args = processModelArgs({
            engine: Engine.ChatGPT,
            tokensPerMinute: "0",
        });

        expect(args.tokensPerMinute).toBeUndefined();
    });

    it("rejects negative --tokens-per-minute values", () => {
        expect(() =>
            processModelArgs({
                engine: Engine.ChatGPT,
                tokensPerMinute: "-1",
            }),
        ).toThrow(/non-negative/);
    });

    it("rejects non-numeric --tokens-per-minute values", () => {
        expect(() =>
            processModelArgs({
                engine: Engine.ChatGPT,
                tokensPerMinute: "lots",
            }),
        ).toThrow(/non-negative/);
    });
});

describe("processModelArgs generation options", () => {
    it("defaults to no generation options for every engine", () => {
        for (const engine of [
            Engine.ChatGPT,
            Engine.Claude,
            Engine.Gemini,
            Engine.Ollama,
        ]) {
            expect(processModelArgs({ engine }).generationOptions).toEqual({});
        }
    });

    it("parses --reasoning-effort and --max-output-tokens for every engine", () => {
        for (const engine of [
            Engine.ChatGPT,
            Engine.Claude,
            Engine.Gemini,
            Engine.Ollama,
        ]) {
            const args = processModelArgs({
                engine,
                maxOutputTokens: "4096",
                reasoningEffort: "none",
            });

            expect(args.generationOptions).toEqual({
                maxOutputTokens: 4096,
                reasoningEffort: "none",
            });
        }
    });

    it("does not add provider params to chatParams", () => {
        const args = processModelArgs({
            engine: Engine.Claude,
            maxOutputTokens: "4096",
            reasoningEffort: "none",
        });

        expect(args.chatParams).toEqual({ messages: [], model: args.model });
    });

    it.each([
        [{ maxOutputTokens: "0" }, /--max-output-tokens/],
        [{ maxOutputTokens: "many" }, /--max-output-tokens/],
        [{ reasoningEffort: "extreme" }, /--reasoning-effort must be one of/],
    ])("rejects invalid values %p", (extra, error) => {
        expect(() =>
            processModelArgs({ engine: Engine.Claude, ...extra }),
        ).toThrow(error);
    });
});
