import { zodResponseFormat } from "openai/helpers/zod";
import ChatInterface from "./chat_interface";
import Role from "../enums/role";
import type OpenAI from "openai";
import type RateLimiter from "../rate_limiter";
import { ZodType, ZodTypeDef } from "zod";

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

    async sendMessage(
        message: string,
        format?: ZodType<any, ZodTypeDef, any>,
        formatName?: string,
    ): Promise<string> {
        if (!this.chatParams) {
            console.trace("Chat not started");
            return "";
        }

        // Limit the history to prevent wasting tokens
        if (this.history.length > 10) {
            this.history = this.history.slice(this.history.length - 10);
        }

        await this.rateLimiter.wait();
        this.rateLimiter.apiCalled();
        this.history.push({ content: message, role: Role.User });

        const formatSchema = format
            ? zodResponseFormat(format, formatName ?? "")
            : undefined;

        try {
            const response = await this.model.chat.completions.create({
                ...this.chatParams,
                messages: this.history,
                response_format: formatSchema,
            });

            const responseText = response.choices[0].message.content;
            if (!responseText) {
                return "";
            }

            this.history.push({ content: responseText, role: Role.Assistant });
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
        if (this.history[this.history.length - 1].role === Role.Assistant) {
            // Remove the last two messages (user and assistant)
            // so we can get back to the last successful state in history
            this.history.pop();
            this.history.pop();
        } else if (this.history[this.history.length - 1].role === Role.User) {
            // The model didn't respond, so we only need to remove the user message
            this.history.pop();
        }
    }

    invalidTranslation(): void {
        this.history.push({
            content: this.invalidTranslationMessage(),
            role: Role.System,
        });
    }

    invalidStyling(): void {
        this.history.push({
            content: this.invalidStylingMessage(),
            role: Role.System,
        });
    }
}
