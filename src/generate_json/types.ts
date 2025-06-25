import { z } from "zod";

export type TranslateItem = {
    id: number;
    key: string;
    original: string;
    translated: string;
    context: string;
    translationTokens: number;
    verificationTokens: number;
    templateStrings: string[];
    translationAttempts: number;
    verificationAttempts: number;
    failure: string;
};

// translation objects

export type TranslateItemInput = {
    id: number;
    original: string;
    context?: string;
    failure?: string;
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
    items: z
        .array(TranslateItemOutputSchema)
        .describe("TranslateItemOutputObjectSchema"), // used for open ai schema name
});

export type TranslateItemOutputObject = {
    items: TranslateItemOutput[];
};

// verification objects

export type VerifyItemInput = {
    id: number;
    original: string;
    translated: string;
    context: string;
    failure: string;
};

export const VerifyItemOutputSchema = z.object({
    // the order is important, having 'valid' and 'issue' before 'fixedTranslation' helps the LLM think and provide a better fix
    id: z.number(),
    valid: z.boolean(),
    issue: z.string(),
    fixedTranslation: z.string(),
});

export type VerifyItemOutput = {
    id: number;
    valid: boolean;
    issue: string;
    fixedTranslation: string;
};

export const VerifyItemOutputObjectSchema = z.object({
    items: z.array(VerifyItemOutputSchema).describe("VerifyItemOutputSchema"), // used for open ai schema name
});

export type VerifyItemOutputObject = {
    items: VerifyItemOutput[];
};

export type GenerateStateJSON = {
    fixedTranslationMappings: { [input: string]: string };
    translationToRetryAttempts: { [translation: string]: number };
    generationRetries: number;
};
