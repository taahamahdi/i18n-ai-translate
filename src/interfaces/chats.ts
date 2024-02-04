import { ChatSession } from "@google/generative-ai";

export default interface Chats {
    generateTranslationChat: ChatSession;
    verifyTranslationChat: ChatSession;
    verifyStylingChat: ChatSession;
}
