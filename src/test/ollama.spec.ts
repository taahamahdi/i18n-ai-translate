import Ollama from "../chats/ollama";
import type { GenerationOptions, ReasoningEffort } from "../types";
import type { Ollama as InternalOllama } from "ollama";

async function sendRequest(
    generationOptions: GenerationOptions = {},
): Promise<Record<string, unknown>> {
    const chatFn = jest.fn().mockResolvedValue({ message: { content: "ok" } });
    const client = { chat: chatFn } as unknown as InternalOllama;
    const chat = new Ollama(client, generationOptions);
    chat.startChat({ messages: [], model: "llama-test", options: { seed: 1 } });
    await chat.sendMessage("Hello");
    return chatFn.mock.calls[0][0];
}

describe("Ollama chat", () => {
    it("sends no think or num_predict by default", async () => {
        const request = await sendRequest();
        expect(request).not.toHaveProperty("think");
        expect(request.options).toEqual({ seed: 1 });
    });

    it.each<[ReasoningEffort, boolean | string]>([
        ["none", false],
        ["minimal", "low"],
        ["low", "low"],
        ["medium", "medium"],
        ["high", "high"],
        ["xhigh", "high"],
        ["max", "high"],
    ])("maps reasoning effort %s to think %p", async (effort, think) => {
        const request = await sendRequest({ reasoningEffort: effort });
        expect(request.think).toBe(think);
    });

    it("maps max output tokens to num_predict and keeps other options", async () => {
        const request = await sendRequest({ maxOutputTokens: 512 });
        expect(request.options).toEqual({ num_predict: 512, seed: 1 });
    });
});
