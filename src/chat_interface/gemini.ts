import ChatInterface from "./chat_interface";
import type {
    ChatSession,
    GenerativeModel,
    StartChatParams,
} from "@google/generative-ai";
import type RateLimiter from "src/rate_limiter";

interface HistoryEntry {
    role: "user" | "system";
    parts: string;
}

export default class Gemini extends ChatInterface {
    model: GenerativeModel;

    chat: ChatSession | null;

    history: HistoryEntry[];

    params: StartChatParams | null;

    rateLimiter: RateLimiter;

    constructor(model: GenerativeModel, rateLimiter: RateLimiter) {
        super();
        this.model = model;
        this.chat = null;
        this.history = [];
        this.params = null;
        this.rateLimiter = rateLimiter;
    }

    startChat(params: StartChatParams): void {
        this.params = params;

        if (this.history.length > 0) {
            params.history = this.history;
        }

        this.chat = this.model.startChat(params);
    }

    async sendMessage(message: string): Promise<string> {
        if (!this.chat) {
            console.trace("Chat not started");
            return "";
        }

        await this.rateLimiter.wait();

        try {
            const generatedContent = await this.chat.sendMessage(message);
            const response = generatedContent.response.text();

            if (!response) {
                console.error(
                    `Gemini exception encountered. err = ${JSON.stringify(generatedContent?.response, null, 4)}`,
                );
            }

            return response;
        } catch (err) {
            console.error(err);
            return "";
        }
    }

    resetChatHistory(): void {
        this.history = [];
        this.startChat(this.params!);
    }

    rollbackLastMessage(): void {
        if (this.history[this.history.length - 1].role === "system") {
            this.history.pop();
            this.history.pop();
        } else if (this.history[this.history.length - 1].role === "user") {
            this.history.pop();
        }

        this.startChat(this.params!);
    }
}
