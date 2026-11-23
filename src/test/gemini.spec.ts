import Gemini from "../chats/gemini";
import RateLimiter from "../rate_limiter";
import type { GenerativeModel } from "@google/generative-ai";

function makeModel(): GenerativeModel {
    return {
        generationConfig: {},
        startChat: jest.fn(),
    } as unknown as GenerativeModel;
}

describe("Gemini chat", () => {
    it("sets maxOutputTokens on the generation config", () => {
        const model = makeModel();
        expect(
            new Gemini(model, new RateLimiter(0, false), { maxOutputTokens: 1000 }),
        ).toBeInstanceOf(Gemini);
        expect(model.generationConfig.maxOutputTokens).toBe(1000);
    });

    it("warns once that reasoning effort is not supported", () => {
        const consoleWarn = jest
            .spyOn(console, "warn")
            .mockImplementation(() => {});

        for (let i = 0; i < 2; i++) {
            expect(
                new Gemini(makeModel(), new RateLimiter(0, false), {
                    reasoningEffort: "low",
                }),
            ).toBeInstanceOf(Gemini);
        }

        expect(consoleWarn).toHaveBeenCalledTimes(1);
        expect(consoleWarn).toHaveBeenCalledWith(
            expect.stringContaining("--reasoning-effort is not supported"),
        );
        consoleWarn.mockRestore();
    });
});
