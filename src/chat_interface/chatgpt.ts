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

        try {
            const response = await this.model.chat.completions.create({
                ...this.chatParams,
                messages: this.history,
            });

            const responseText = response.choices[0].message.content;
            if (!responseText) {
                return "";
            }

            this.history.push({ role: "user", content: message });
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
}
