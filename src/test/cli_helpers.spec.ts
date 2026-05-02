// Focused coverage for processModelArgs — exercises the per-engine
// defaults and the --tokens-per-minute parser in isolation.

process.env.OPENAI_API_KEY = "test";
process.env.ANTHROPIC_API_KEY = "test";
process.env.GEMINI_API_KEY = "test";

import Engine from "../enums/engine";
import { processModelArgs } from "../cli_helpers";

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
