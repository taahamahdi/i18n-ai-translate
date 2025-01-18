import { GoogleGenerativeAI } from "@google/generative-ai";
import { Ollama as InternalOllama } from "ollama";
import ChatGPT from "./chatgpt";
import Engine from "../enums/engine";
import Gemini from "./gemini";
import Ollama from "./ollama";
import OpenAI from "openai";
import type { ChatParams, Model } from "../types";
import type ChatInterface from "./chat_interface";
import type RateLimiter from "../rate_limiter";

export default class ChatFactory {
    static newChat(
        engine: Engine,
        model: Model,
        rateLimiter: RateLimiter,
        apiKey?: string,
        host?: string,
    ): ChatInterface {
        let chat: ChatInterface;
        let params: ChatParams;
        switch (engine) {
            case Engine.Gemini: {
                const genAI = new GoogleGenerativeAI(apiKey!);
                const geminiModel = genAI.getGenerativeModel({ model });

                // Gemini limits us to 60 RPM => 1 call per second
                chat = new Gemini(geminiModel, rateLimiter);
                params = {
                    history: [],
                };
                break;
            }

            case Engine.ChatGPT: {
                const openAI = new OpenAI({ apiKey: apiKey! });

                // Free-tier rate limits are 3 RPM => 1 call every 20 seconds
                // Tier 1 is a reasonable 500 RPM => 1 call every 120ms
                // TODO: token limits
                chat = new ChatGPT(openAI, rateLimiter);
                params = {
                    messages: [],
                    model,
                };
                break;
            }

            case Engine.Ollama: {
                const llama = new InternalOllama({ host });
                chat = new Ollama(llama);
                params = {
                    messages: [],
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
