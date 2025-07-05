import { GoogleGenerativeAI } from "@google/generative-ai";
import { Anthropic as InternalAnthropic } from "@anthropic-ai/sdk";
import { Ollama as InternalOllama } from "ollama";
import Anthropic from "./anthropic";
import ChatGPT from "./chatgpt";
import Engine from "../enums/engine";
import Gemini from "./gemini";
import Ollama from "./ollama";
import OpenAI from "openai";
import type { ChatParams, Model } from "../types";
import type { ChatRequest } from "ollama";
import type { MessageCreateParams } from "@anthropic-ai/sdk/resources";
import type { StartChatParams } from "@google/generative-ai";
import type ChatInterface from "./chat_interface";
import type RateLimiter from "../rate_limiter";

export default class ChatFactory {
    static newChat(
        engine: Engine,
        model: Model,
        rateLimiter: RateLimiter,
        apiKey?: string,
        host?: string,
        chatParams?: ChatParams,
    ): ChatInterface {
        let chat: ChatInterface;
        let params: ChatParams;
        switch (engine) {
            case Engine.Gemini: {
                const genAI = new GoogleGenerativeAI(apiKey!);
                const geminiModel = genAI.getGenerativeModel({ model });
                chat = new Gemini(geminiModel, rateLimiter);
                params = {
                    ...(chatParams as StartChatParams),
                };
                break;
            }

            case Engine.ChatGPT: {
                const openAI = new OpenAI({ apiKey: apiKey! });
                chat = new ChatGPT(openAI, rateLimiter);
                params = {
                    ...(chatParams as OpenAI.ChatCompletionCreateParamsNonStreaming),
                    model,
                };
                break;
            }

            case Engine.Ollama: {
                const llama = new InternalOllama({ host });
                chat = new Ollama(llama);
                params = {
                    ...(chatParams as ChatRequest),
                    model,
                };

                break;
            }

            case Engine.Claude: {
                const anthropic = new InternalAnthropic({ apiKey: apiKey! });
                chat = new Anthropic(anthropic, rateLimiter);
                params = {
                    ...(chatParams as MessageCreateParams),
                    model,
                };

                break;
            }

            default:
                throw new Error("Invalid engine");
        }

        chat.startChat(params);
        return chat;
    }
}
