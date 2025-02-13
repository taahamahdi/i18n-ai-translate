import type { ChatRequest } from "ollama";
import type { ChatSession, StartChatParams } from "@google/generative-ai";
import type { MessageCreateParams } from "@anthropic-ai/sdk/resources";
import type OpenAI from "openai";
import type PromptMode from "./enums/prompt_mode";

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
    promptMode: PromptMode;
};

export type GenerateState = {
    fixedTranslationMappings: { [input: string]: string };
    translationToRetryAttempts: { [translation: string]: number };
    inputLineToTemplatedString: { [index: number]: Array<string> };
    splitInput: Array<string>;
    generationRetries: number;
};

export type TranslationStats = {
    batchStartTime: number;
    processedItems: number;
    enqueuedItems: number;
};
