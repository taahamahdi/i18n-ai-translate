import { z } from "zod";

export type TranslateItem = {
    id: number;
    key: string;
    original: string;
    translated: string;
    context: string;
    translationTokens: number;
    verificationTokens: number;
};

// translation objects

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
};

export const VerifyItemOutputSchema = z.object({
    id: z.number(),
    valid: z.boolean(),
    fixedTranslation: z.string().optional(),
});

export type VerifyItemOutput = {
    id: number;
    valid: boolean;
    fixedTranslation?: string;
};

export const VerifyItemOutputObjectSchema = z.object({
    items: z.array(VerifyItemOutputSchema).describe("VerifyItemOutputSchema"), // used for open ai schema name
});

export type VerifyItemOutputObject = {
    items: VerifyItemOutput[];
};
