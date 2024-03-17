import type ChatInterface from "../chat_interface/chat_interface";

export default interface Chats {
    generateTranslationChat: ChatInterface;
    verifyTranslationChat: ChatInterface;
    verifyStylingChat: ChatInterface;
}
