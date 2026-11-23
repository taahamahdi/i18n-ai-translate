import ChatGPT from "../chats/chatgpt";
import RateLimiter from "../rate_limiter";
import type { GenerationOptions } from "../types";
import type OpenAI from "openai";

async function sendRequest(
    generationOptions: GenerationOptions = {},
): Promise<Record<string, unknown>> {
    const create = jest.fn().mockResolvedValue({
        choices: [{ message: { content: "ok" } }],
    });

    const client = { chat: { completions: { create } } } as unknown as OpenAI;
    const chat = new ChatGPT(
        client,
        new RateLimiter(0, false),
        generationOptions,
    );

    chat.startChat({ messages: [], model: "gpt-test" });
    await chat.sendMessage("Hello");
    return create.mock.calls[0][0];
}

describe("ChatGPT chat", () => {
    it("sends no reasoning or token params by default", async () => {
        const request = await sendRequest();
        expect(request).not.toHaveProperty("reasoning_effort");
        expect(request).not.toHaveProperty("max_completion_tokens");
    });

    it("maps reasoning effort and max output tokens", async () => {
        const request = await sendRequest({
            maxOutputTokens: 2048,
            reasoningEffort: "none",
        });

        expect(request).toMatchObject({
            max_completion_tokens: 2048,
            reasoning_effort: "none",
        });
    });
});
