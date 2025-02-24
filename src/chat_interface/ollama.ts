import { printError } from "../utils";
import ChatInterface from "./chat_interface";
import Role from "../enums/role";
import zodToJsonSchema from "zod-to-json-schema";
import type { ChatRequest, Ollama as InternalOllama, Message } from "ollama";
import type { ZodType, ZodTypeDef } from "zod";

export default class Ollama extends ChatInterface {
    model: InternalOllama;

    chatParams:
        | (ChatRequest & {
              stream: false;
          })
        | null;

    history: Message[];

    constructor(model: InternalOllama) {
        super();
        this.model = model;
        this.chatParams = null;
        this.history = [];
    }

    startChat(params: ChatRequest): void {
        this.chatParams = { ...params, stream: false };
        if (params.messages && params.messages.length > 0) {
            this.history = params.messages;
        }
    }

    async sendMessage(
        message: string,
        format?: ZodType<any, ZodTypeDef, any>,
    ): Promise<string> {
        if (!this.chatParams) {
            console.trace("Chat not started");
            return "";
        }

        this.history.push({ content: message, role: Role.User });

        const formatSchema = format ? zodToJsonSchema(format) : undefined;

        this.chatParams = {
            ...this.chatParams,
            format: formatSchema,
            messages: [{ content: message, role: Role.User }],
            // message history breaks small models, they translate the previous message over and over instead of translating the new lines
            // we should add a way to enable/disable message history
        };

        try {
            const response = await this.model.chat(this.chatParams);

            const responseText = response.message.content;
            if (!responseText) {
                return "";
            }

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
