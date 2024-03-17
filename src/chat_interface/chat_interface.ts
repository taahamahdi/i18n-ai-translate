import type { ChatParams } from "../types";

export default abstract class ChatInterface {
    abstract startChat(params: ChatParams): void;
    abstract sendMessage(message: string): Promise<string>;
    abstract resetChatHistory(): void;
    abstract rollbackLastMessage(): void;
    abstract invalidTranslation(): void;
    abstract invalidStyling(): void;

    invalidTranslationMessage(): string {
        return "The provided translation is incorrect. Please re-attempt the translation and conform to the same rules as the original prompt.";
    }

    invalidStylingMessage(): string {
        return "Although the provided translation was correct, the styling was not maintained. Please re-attempt the translation and ensure that the output text maintains the same style as the original prompt.";
    }
}
