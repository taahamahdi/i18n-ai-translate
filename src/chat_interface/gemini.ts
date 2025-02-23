import { ANSIStyles } from "../constants";
import { toGeminiSchema } from "gemini-zod";
import ChatInterface from "./chat_interface";
import Role from "../enums/role";
import type {
    ChatSession,
    Content,
    GenerativeModel,
    StartChatParams,
} from "@google/generative-ai";
import type { ZodType, ZodTypeDef } from "zod";
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
                    parts: [{ text: x.parts }],
                    role: x.role === Role.User ? "user" : "model",
                }),
            );
        }

        this.chat = this.model.startChat(params);
    }

    async sendMessage(
        message: string,
        format?: ZodType<any, ZodTypeDef, any>,
    ): Promise<string> {
        if (!this.chat) {
            console.trace("Chat not started");
            return "";
        }

        await this.rateLimiter.wait();
        this.rateLimiter.apiCalled();

        if (format) {
            this.model.generationConfig.responseMimeType = "application/json";
            this.model.generationConfig.responseSchema = toGeminiSchema(format);
        } else {
            this.model.generationConfig.responseMimeType = "";
            this.model.generationConfig.responseSchema = undefined;
        }

        try {
            const generatedContent = await this.chat.sendMessage(message);
            const response = generatedContent.response.text();

            if (!response) {
                console.error(
                    ANSIStyles.bright,
                    ANSIStyles.fg.red,
                    `Gemini exception encountered. err = ${JSON.stringify(generatedContent?.response, null, 4)}`,
                    ANSIStyles.reset,
                );
            }

            return response.trimEnd();
        } catch (err) {
            console.error(
                ANSIStyles.bright,
                ANSIStyles.fg.red,
                err,
                ANSIStyles.reset,
            );
            return "";
        }
    }

    resetChatHistory(): void {
        this.history = [];
        this.startChat(this.params!);
    }

    rollbackLastMessage(): void {
        if (this.history.length === 0) {
            return;
        }

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
            parts: this.invalidTranslationMessage(),
            role: Role.System,
        });
    }

    invalidStyling(): void {
        this.history.push({
            parts: this.invalidStylingMessage(),
            role: Role.System,
        });
    }
}
