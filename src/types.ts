import type { ChatRequest } from "ollama";
import type { ChatSession, StartChatParams } from "@google/generative-ai";
import type OpenAI from "openai";

export type Chat = ChatSession | OpenAI.Completion;

export type ChatParams =
    | StartChatParams
    | OpenAI.ChatCompletionCreateParamsNonStreaming
    | ChatRequest;

export type Model =
    | "gemini-pro"
    | OpenAI.ChatCompletionCreateParamsNonStreaming["model"]
    | string;
