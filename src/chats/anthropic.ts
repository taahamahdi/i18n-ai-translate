import { DEFAULT_CLAUDE_MAX_TOKENS } from "../constants";
import { printError } from "../utils";
import ChatInterface, { type InvalidKind } from "./chat_interface";
import Role from "../enums/role";
import type { GenerationOptions } from "../types";
import type { Anthropic as InternalAnthropic } from "@anthropic-ai/sdk";
import type {
    MessageCreateParams,
    MessageParam,
    TextBlock,
} from "@anthropic-ai/sdk/resources";
import type { ZodType, ZodTypeDef } from "zod";
import type RateLimiter from "../rate_limiter";

export default class Anthropic extends ChatInterface {
    model: InternalAnthropic;

    chatParams: MessageCreateParams | null;

    history: MessageParam[];

    rateLimiter: RateLimiter;

    generationOptions: GenerationOptions;

    constructor(
        model: InternalAnthropic,
        rateLimiter: RateLimiter,
        generationOptions: GenerationOptions = {},
    ) {
        super();
        this.model = model;
        this.chatParams = null;
        this.history = [];
        this.rateLimiter = rateLimiter;
        this.generationOptions = generationOptions;
    }

    startChat(params: MessageCreateParams): void {
        this.chatParams = params;
        if (params.messages.length > 0) {
            this.history = params.messages;
        }
    }

    async sendMessage(
        message: string,
        _format?: ZodType<any, ZodTypeDef, any>,
    ): Promise<string> {
        if (!this.chatParams) {
            console.trace("Chat not started");
            return "";
        }

        // Limit the history to prevent wasting tokens
        if (this.history.length > 2) {
            this.history = this.history.slice(this.history.length - 2);
        }

        // Cheap ~4-chars-per-token estimate; the limiter no-ops the TPM
        // check when no cap is configured. Double to account for the
        // response tokens we'll also be billed for.
        await this.rateLimiter.acquire(Math.ceil(message.length / 2));
        this.history.push({ content: message, role: Role.User });

        try {
            const response = await this.model.messages.create({
                ...this.chatParams,
                ...this.reasoningParams(),
                max_tokens:
                    this.generationOptions.maxOutputTokens ??
                    DEFAULT_CLAUDE_MAX_TOKENS,
                messages: this.history,
                stream: false,
            });

            // Thinking models can return thinking blocks before the text
            const textBlock = response.content?.find(
                (block): block is TextBlock => block.type === "text",
            );

            if (!textBlock) {
                if (response.stop_reason === "max_tokens") {
                    printError(
                        "Claude used its whole output budget for thinking and returned no translation. Pass --reasoning-effort none or raise --max-output-tokens.",
                    );
                }

                return "";
            }

            const responseText = textBlock.text;
            this.history.push({ content: responseText, role: Role.Assistant });
            return responseText;
        } catch (err) {
            printError(err);
            return "";
        }
    }

    resetChatHistory(): void {
        this.history = [];
    }

    rollbackLastMessage(): void {
        if (this.history[this.history.length - 1].role === Role.Assistant) {
            // Remove the last two messages (user and assistant)
            // so we can get back to the last successful state in history
            this.history.pop();
            this.history.pop();
        } else if (this.history[this.history.length - 1].role === Role.User) {
            // The model didn't respond, so we only need to remove the user message
            this.history.pop();
        }
    }

    signalInvalid(kind: InvalidKind): void {
        // Anthropic's messages.create only accepts alternating user /
        // assistant messages, so we reuse the user role rather than
        // tag this as system.
        this.history.push({
            content: this.invalidMessage(kind),
            role: Role.User,
        });
    }

    private reasoningParams(): Pick<
        MessageCreateParams,
        "output_config" | "thinking"
    > {
        const effort = this.generationOptions.reasoningEffort;
        switch (effort) {
            case undefined:
                return {};
            case "none":
                return { thinking: { type: "disabled" } };
            case "minimal":
                return {
                    output_config: { effort: "low" },
                    thinking: { type: "adaptive" },
                };
            default:
                return {
                    output_config: { effort },
                    thinking: { type: "adaptive" },
                };
        }
    }
}
