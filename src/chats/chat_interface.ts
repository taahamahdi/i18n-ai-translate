import type { ChatParams } from "../types";
import type { ZodType, ZodTypeDef } from "zod";

export type InvalidKind = "translation" | "styling";

export default abstract class ChatInterface {
    abstract startChat(params: ChatParams): void;
    abstract sendMessage(
        message: string,
        format?: ZodType<any, ZodTypeDef, any>,
    ): Promise<string>;

    abstract resetChatHistory(): void;
    abstract rollbackLastMessage(): void;

    /**
     * Record that the last translation was rejected, so the next
     * sendMessage call picks up the nag message in history.
     * Implementations choose whether to tag that message as System or
     * User — Anthropic, for example, only accepts alternating User /
     * Assistant messages, so it reuses User.
     */
    abstract signalInvalid(kind: InvalidKind): void;

    protected invalidMessage(kind: InvalidKind): string {
        if (kind === "translation") {
            return "The provided translation is incorrect. Re-attempt the translation and conform to the same rules as the original prompt.";
        }

        return "The provided translation was correct, but the styling was not maintained. Re-attempt the translation and ensure that the output text maintains the same style as the original prompt.";
    }
}
