import ChatInterface from "./chat_interface";
import Role from "../enums/role";
import type { ChatRequest, Ollama as InternalOllama, Message } from "ollama";

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

    async sendMessage(message: string): Promise<string> {
        if (!this.chatParams) {
            console.trace("Chat not started");
            return "";
        }

        this.history.push({ content: message, role: Role.User });
        this.chatParams = {
            ...this.chatParams,
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
