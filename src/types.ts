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
    id: number;
    key: string;
    original: string;
    translated: string;
    context: string;
};

export type TranslateItemInput = {
    id: number;
    original: string;
    context?: string;
};

export const TranslateItemOutputSchema = z.object({
    id: z.number(),
    translated: z.string(),
});

export type TranslateItemOutput = {
    id: number;
    translated: string;
};

export const TranslateItemOutputObjectSchema = z.object({
    items: z.array(TranslateItemOutputSchema),
});

export type TranslateItemOutputObject = {
    items: TranslateItemOutput[];
};

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
