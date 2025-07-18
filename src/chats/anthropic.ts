import { printError } from "../utils";
import ChatInterface from "./chat_interface";
import Role from "../enums/role";
import type { Anthropic as InternalAnthropic } from "@anthropic-ai/sdk";
import type {
    MessageCreateParams,
    MessageParam,
} from "@anthropic-ai/sdk/resources";
import type { ZodType, ZodTypeDef } from "zod";
import type RateLimiter from "../rate_limiter";

export default class Anthropic extends ChatInterface {
    model: InternalAnthropic;

    chatParams: MessageCreateParams | null;

    history: MessageParam[];

    rateLimiter: RateLimiter;

    constructor(model: InternalAnthropic, rateLimiter: RateLimiter) {
        super();
        this.model = model;
        this.chatParams = null;
        this.history = [];
        this.rateLimiter = rateLimiter;
    }

    startChat(params: MessageCreateParams): void {
        this.chatParams = params;
        if (params.messages.length > 0) {
            this.history = params.messages;
        }
    }

    async sendMessage(
        message: string,
        _format?: ZodType<any, ZodTypeDef, any>,
    ): Promise<string> {
        if (!this.chatParams) {
            console.trace("Chat not started");
            return "";
        }

        // Limit the history to prevent wasting tokens
        if (this.history.length > 2) {
            this.history = this.history.slice(this.history.length - 2);
        }

        await this.rateLimiter.wait();
        this.rateLimiter.apiCalled();
        this.history.push({ content: message, role: Role.User });

        try {
            const response = await this.model.messages.create({
                ...this.chatParams,
                max_tokens: 1024,
                messages: this.history,
                stream: false,
            });

            const responseBlock = response.content;
            if (
                !responseBlock ||
                responseBlock.length < 1 ||
                responseBlock[0].type !== "text"
            ) {
                return "";
            }

            const responseText = responseBlock[0].text;
            this.history.push({ content: responseText, role: Role.Assistant });
            return responseText;
        } catch (err) {
            printError(err);
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
            // Note: no System role
            role: Role.User,
        });
    }

    invalidStyling(): void {
        this.history.push({
            content: this.invalidStylingMessage(),
            // Note: no System role
            role: Role.User,
        });
    }
}
