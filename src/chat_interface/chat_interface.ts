import type { ChatParams } from "../types";

export default abstract class ChatInterface {
    abstract startChat(params: ChatParams): void;
    abstract sendMessage(message: string): Promise<string>;
    abstract resetChatHistory(): void;
    abstract rollbackLastMessage(): void;
    abstract invalidTranslation(): void;
    abstract invalidStyling(): void;
}
