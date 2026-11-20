import Anthropic from "../chats/anthropic";
import RateLimiter from "../rate_limiter";
import type { GenerationOptions } from "../types";
import type { Anthropic as InternalAnthropic } from "@anthropic-ai/sdk";
import type { MessageCreateParams } from "@anthropic-ai/sdk/resources";

function makeChat(
    response: object,
    generationOptions: GenerationOptions = {},
): { chat: Anthropic; stream: jest.Mock } {
    const stream = jest.fn(() => ({
        finalMessage: () => Promise.resolve(response),
    }));

    const client = {
        messages: { stream },
    } as unknown as InternalAnthropic;

    const chat = new Anthropic(
        client,
        new RateLimiter(0, false),
        generationOptions,
    );

    chat.startChat({
        messages: [],
        model: "claude-test",
    } as unknown as MessageCreateParams);

    return { chat, stream };
}

describe("Anthropic chat", () => {
    it("returns the text block that follows a thinking block", async () => {
        const { chat } = makeChat({
            content: [
                { signature: "", thinking: "", type: "thinking" },
                { text: "\"Bonjour\"", type: "text" },
            ],
            stop_reason: "end_turn",
        });

        await expect(chat.sendMessage("Hello")).resolves.toBe("\"Bonjour\"");
    });

    it("returns an empty string and a hint when only thinking fits into max_tokens", async () => {
        const consoleError = jest
            .spyOn(console, "error")
            .mockImplementation(() => {});

        const { chat } = makeChat({
            content: [{ signature: "", thinking: "", type: "thinking" }],
            stop_reason: "max_tokens",
        });

        await expect(chat.sendMessage("Hello")).resolves.toBe("");
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
    });

    it("defaults max_tokens to 8192 and sends no reasoning params", async () => {
        const { chat, stream } = makeChat({
            content: [{ text: "ok", type: "text" }],
        });

        await chat.sendMessage("Hello");
        const request = stream.mock.calls[0][0];
        expect(request.max_tokens).toBe(8192);
        expect(request.thinking).toBeUndefined();
        expect(request.output_config).toBeUndefined();
    });

    it.each([
        ["none", { thinking: { type: "disabled" } }],
        [
            "minimal",
            { output_config: { effort: "low" }, thinking: { type: "adaptive" } },
        ],
        [
            "high",
            {
                output_config: { effort: "high" },
                thinking: { type: "adaptive" },
            },
        ],
        [
            "max",
            { output_config: { effort: "max" }, thinking: { type: "adaptive" } },
        ],
    ] as const)(
        "maps reasoning effort %s",
        async (reasoningEffort, expected) => {
            const { chat, stream } = makeChat(
                { content: [{ text: "ok", type: "text" }] },
                { reasoningEffort },
            );

            await chat.sendMessage("Hello");
            expect(stream.mock.calls[0][0]).toMatchObject(expected);
        },
    );

    it("uses maxOutputTokens as max_tokens", async () => {
        const { chat, stream } = makeChat(
            { content: [{ text: "ok", type: "text" }] },
            { maxOutputTokens: 4096 },
        );

        await chat.sendMessage("Hello");
        expect(stream.mock.calls[0][0].max_tokens).toBe(4096);
    });
});
