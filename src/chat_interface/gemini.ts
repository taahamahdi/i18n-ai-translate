import ChatInterface from "./chat_interface";
import Role from "../enums/role";
import type {
    ChatSession,
    Content,
    GenerativeModel,
    StartChatParams,
} from "@google/generative-ai";
import type RateLimiter from "../rate_limiter";

interface HistoryEntry {
    role: Role;
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
            params.history = this.history.map(
                (x): Content => ({
                    role: x.role === Role.User ? "user" : "model",
                    parts: [{ text: x.parts }],
                }),
            );
        }

        this.chat = this.model.startChat(params);
    }

    async sendMessage(message: string): Promise<string> {
        if (!this.chat) {
            console.trace("Chat not started");
            return "";
        }

        await this.rateLimiter.wait();
        this.rateLimiter.apiCalled();

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
        if (this.history[this.history.length - 1].role === Role.Assistant) {
            this.history.pop();
            this.history.pop();
        } else if (this.history[this.history.length - 1].role === Role.User) {
            this.history.pop();
        }

        this.startChat(this.params!);
    }

    invalidTranslation(): void {
        this.history.push({
            role: Role.System,
            parts: "The provided translation is incorrect. Please re-attempt the translation and conform to the same rules as the original prompt.",
        });
    }

    invalidStyling(): void {
        this.history.push({
            role: Role.System,
            parts: "Although the provided translation was correct, the styling was not maintained. Please re-attempt the translation and ensure that the output text maintains the same style as the original prompt.",
        });
    }
}
