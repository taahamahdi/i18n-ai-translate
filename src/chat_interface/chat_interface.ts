import type { ChatParams } from "../types";
import type { ZodType, ZodTypeDef } from "zod";

export default abstract class ChatInterface {
    abstract startChat(params: ChatParams): void;
    abstract sendMessage(
        message: string,
        format?: ZodType<any, ZodTypeDef, any>,
    ): Promise<string>;

    abstract resetChatHistory(): void;
    abstract rollbackLastMessage(): void;
    abstract invalidTranslation(): void;
    abstract invalidStyling(): void;

    invalidTranslationMessage(): string {
        return "The provided translation is incorrect. Re-attempt the translation and conform to the same rules as the original prompt.";
    }

    invalidStylingMessage(): string {
        return "The provided translation was correct, but the styling was not maintained. Re-attempt the translation and ensure that the output text maintains the same style as the original prompt.";
    }
}
