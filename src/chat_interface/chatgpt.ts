import ChatInterface from "./chat_interface";
import type OpenAI from "openai";
import type RateLimiter from "src/rate_limiter";

export default class ChatGPT extends ChatInterface {
    model: OpenAI;

    chatParams: OpenAI.ChatCompletionCreateParamsNonStreaming | null;

    history: OpenAI.ChatCompletionMessageParam[];

    rateLimiter: RateLimiter;

    constructor(model: OpenAI, rateLimiter: RateLimiter) {
        super();
        this.model = model;
        this.chatParams = null;
        this.history = [];
        this.rateLimiter = rateLimiter;
    }

    startChat(params: OpenAI.ChatCompletionCreateParamsNonStreaming): void {
        this.chatParams = params;
        if (params.messages.length > 0) {
            this.history = params.messages;
        }
    }

    async sendMessage(message: string): Promise<string> {
        if (!this.chatParams) {
            console.trace("Chat not started");
            return "";
        }

        await this.rateLimiter.wait();
        this.rateLimiter.apiCalled();
        this.history.push({ role: "user", content: message });

        try {
            const response = await this.model.chat.completions.create({
                ...this.chatParams,
                messages: this.history,
            });

            const responseText = response.choices[0].message.content;
            if (!responseText) {
                return "";
            }

            this.history.push({ role: "system", content: responseText });
            return responseText;
        } catch (err) {
            console.error(err);
            return "";
        }
    }

    resetChatHistory(): void {
        this.history = [];
    }

    rollbackLastMessage(): void {
        if (this.history[this.history.length - 1].role === "system") {
            this.history.pop();
            this.history.pop();
        } else if (this.history[this.history.length - 1].role === "user") {
            this.history.pop();
        }
    }

    invalidTranslation(): void {
        this.history.push({
            role: "user",
            content:
                "The provided translation is incorrect. Please re-attempt the translation and conform to the same rules as the original prompt.",
        });
    }

    invalidStyling(): void {
        this.history.push({
            role: "user",
            content:
                "Although the provided translation was correct, the styling was not maintained. Please re-attempt the translation and ensure that the output text maintains the same style as the original prompt.",
        });
    }
}
