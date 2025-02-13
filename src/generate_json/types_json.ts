import { z } from "zod";

export type TranslateItem = {
    id: number;
    key: string;
    original: string;
    translated: string;
    context: string;
    tokens: number;
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
    items: z
        .array(TranslateItemOutputSchema)
        .describe("TranslateItemOutputObjectSchema"), // used for open ai schema name
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
