import type ChatInterface from "../chats/chat_interface";

export default interface Chats {
    generateTranslationChat: ChatInterface;
    verifyTranslationChat: ChatInterface;
    verifyStylingChat: ChatInterface;
}
