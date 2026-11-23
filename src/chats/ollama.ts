import { printError } from "../utils";
import ChatInterface, { type InvalidKind } from "./chat_interface";
import Role from "../enums/role";
import zodToJsonSchema from "zod-to-json-schema";
import type { ChatRequest, Ollama as InternalOllama, Message } from "ollama";
import type { GenerationOptions, ReasoningEffort } from "../types";
import type { ZodType, ZodTypeDef } from "zod";

/**
 * Ollama accepts true/false or low/medium/high; other levels map to the nearest one.
 * @param effort - the reasoning effort
 * @returns the value for the `think` request parameter.
 */
function toThink(effort: ReasoningEffort): ChatRequest["think"] {
    switch (effort) {
        case "none":
            return false;
        case "minimal":
        case "low":
            return "low";
        case "medium":
            return "medium";
        default:
            return "high";
    }
}

export default class Ollama extends ChatInterface {
    model: InternalOllama;

    chatParams:
        | (ChatRequest & {
              stream: false;
          })
        | null;

    history: Message[];

    generationOptions: GenerationOptions;

    constructor(
        model: InternalOllama,
        generationOptions: GenerationOptions = {},
    ) {
        super();
        this.model = model;
        this.chatParams = null;
        this.history = [];
        this.generationOptions = generationOptions;
    }

    startChat(params: ChatRequest): void {
        const { maxOutputTokens, reasoningEffort } = this.generationOptions;
        this.chatParams = {
            ...params,
            ...(reasoningEffort && { think: toThink(reasoningEffort) }),
            ...(maxOutputTokens && {
                options: { ...params.options, num_predict: maxOutputTokens },
            }),
            stream: false,
        };
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
            messages: this.history,
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

    signalInvalid(kind: InvalidKind): void {
        this.history.push({
            content: this.invalidMessage(kind),
            role: Role.System,
        });
    }
}
