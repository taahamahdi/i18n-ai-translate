import Anthropic from "../chats/anthropic";
import RateLimiter from "../rate_limiter";
import type { Anthropic as InternalAnthropic } from "@anthropic-ai/sdk";
import type { MessageCreateParams } from "@anthropic-ai/sdk/resources";

function makeChat(response: object): { chat: Anthropic; create: jest.Mock } {
    const create = jest.fn().mockResolvedValue(response);
    const client = { messages: { create } } as unknown as InternalAnthropic;
    const chat = new Anthropic(client, new RateLimiter(0, false));
    chat.startChat({
        messages: [],
        model: "claude-test",
    } as unknown as MessageCreateParams);

    return { chat, create };
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
});
