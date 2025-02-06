import type { ChatRequest } from "ollama";
import type { ChatSession, StartChatParams } from "@google/generative-ai";
import type { MessageCreateParams } from "@anthropic-ai/sdk/resources";
import type OpenAI from "openai";
import { z } from "zod";

export type Chat = ChatSession | OpenAI.Completion;

export type ChatParams =
    | StartChatParams
    | OpenAI.ChatCompletionCreateParamsNonStreaming
    | ChatRequest
    | MessageCreateParams;

export type Model =
    | "gemini-pro"
    | OpenAI.ChatCompletionCreateParamsNonStreaming["model"]
    | string;

export type ModelArgs = {
    model: Model;
    chatParams: ChatParams;
    rateLimitMs: number;
    apiKey: string | undefined;
    host: string | undefined;
};

export type TranslateItem = {
    key: string;
    originalText: string;
    translatedText: string;
    context: string;
};

export type TranslateItemInput = {
    key: string;
    originalText: string;
    context: string;
};

export const TranslateItemOutputSchema = z.object({
    key: z.string(),
    translatedText: z.string(),
});

export type TranslateItemOutput = {
    key: string;
    translatedText: string;
};

export const TranslateItemOutputArraySchema = z.array(
    TranslateItemOutputSchema,
);

export type CheckTranslateItem = {
    key: string;
    originalText: string;
    translatedText: string;
    context: string;
    invalid: boolean | null;
    invalidReason: string;
};

export type RetranslateItem = {
    key: string;
    originalText: string;
    newTranslatedText: string;
    context: string;
    invalidTranslatedText: string;
    invalidReason: string;
};

export type TranslateItemResult = {
    key: string;
    translatedText: string;
};
