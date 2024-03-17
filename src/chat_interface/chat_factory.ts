import { GoogleGenerativeAI } from "@google/generative-ai";
import ChatGPT from "./chatgpt";
import Engine from "../enums/engine";
import Gemini from "./gemini";
import OpenAI from "openai";
import type { ChatParams, Model } from "../types";
import type ChatInterface from "./chat_interface";
import type RateLimiter from "src/rate_limiter";

const defaultModel = (engine: Engine): string => {
    switch (engine) {
        case Engine.Gemini:
            return "gemini-pro";
        case Engine.ChatGPT:
            return "gpt-4";
        default:
            throw new Error("Invalid model");
    }
};

export default class ChatFactory {
    static newChat(
        engine: Engine,
        model: Model,
        apiKey: string,
        rateLimiter: RateLimiter,
    ): ChatInterface {
        let chat: ChatInterface;
        let params: ChatParams;

        if (!model) {
            model = defaultModel(engine);
        }

        switch (engine) {
            case Engine.Gemini: {
                const genAI = new GoogleGenerativeAI(apiKey);
                const geminiModel = genAI.getGenerativeModel({ model });

                // Gemini limits us to 1 call per second
                chat = new Gemini(geminiModel, rateLimiter);
                params = {
                    history: [],
                };
                break;
            }

            case Engine.ChatGPT: {
                const openAI = new OpenAI({ apiKey });

                // Free-tier rate limits are 3 RPM => 1 call every 20 seconds
                chat = new ChatGPT(openAI, rateLimiter);
                params = {
                    model,
                    messages: [],
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
