import { RETRY_ATTEMPTS } from "../constants";
import { Tiktoken } from "tiktoken";
import {
    TranslateItemOutputObjectSchema,
    VerifyItemOutputObjectSchema,
} from "./types";
import {
    getMissingVariables,
    getTemplatedStringRegex,
    printError,
    printExecutionTime,
    printProgress,
    printWarn,
} from "../utils";
import { retryWithBackoff } from "../retry";
import { runAcrossShards } from "../shard_runner";
import { translationPromptJSON, verificationPromptJSON } from "./prompts";
import cl100k_base from "tiktoken/encoders/cl100k_base.json";
import type {
    GenerateStateJSON,
    TranslateItem,
    TranslateItemInput,
    TranslateItemOutput,
    VerifyItemInput,
    VerifyItemOutput,
} from "./types";
import type { TranslationStatsItem } from "../types";
import type { ZodType, ZodTypeDef } from "zod";
import type Chats from "../interfaces/chats";
import type GenerateTranslationOptionsJSON from "../interfaces/generate_translation_options_json";
import type RateLimiter from "../rate_limiter";
import type TranslateOptions from "../interfaces/translate_options";
import type TranslationContext from "../interfaces/translation_context";

export default class GenerateTranslationJSON {
    tikToken: Tiktoken;
    templatedStringRegex: RegExp;

    constructor(options: TranslateOptions) {
        this.tikToken = new Tiktoken(
            cl100k_base.bpe_ranks,
            cl100k_base.special_tokens,
            cl100k_base.pat_str,
        );

        this.templatedStringRegex = getTemplatedStringRegex(
            options.templatedStringPrefix as string,
            options.templatedStringSuffix as string,
        );
    }

    /**
     * Complete the initial translation of the input text.
     * @param flatInput - The flatinput object containing the json to translate
     * @param options - The options to generate the translation
     * @param chats - The options to generate the translation
     * @param translationStats - The translation statistics
     */
    public async translateJSON(
        ctx: TranslationContext,
    ): Promise<{ [key: string]: string }> {
        const { flatInput, options, pool, groups, stats } = ctx;

        // Seed stats once up front; per-shard work then just increments
        // the shared counters.
        const allItems = this.generateTranslateItemArray(flatInput);
        stats.translate.totalItems = allItems.length;
        stats.translate.totalTokens = allItems.reduce(
            (sum, item) => sum + item.translationTokens,
            0,
        );

        stats.translate.batchStartTime = Date.now();

        const perShardResults = await runAcrossShards(
            flatInput,
            groups,
            pool,
            async (shard, chats) => {
                const shardItems = this.generateTranslateItemArray(shard);
                const translated = await this.generateTranslationJSON(
                    shardItems,
                    options,
                    chats,
                    stats.translate,
                    pool.rateLimiter,
                );

                if (options.skipTranslationVerification) {
                    return translated;
                }

                return this.generateVerificationJSON(
                    translated,
                    options,
                    chats,
                    stats.verify,
                    pool.rateLimiter,
                );
            },
        );

        const combined: TranslateItem[] = [];
        for (const shardResult of perShardResults) {
            combined.push(...shardResult);
        }

        return this.convertTranslateItemToIndex(combined);
    }

    /**
     * Run the verification step against a source/target pair without
     * writing anything. Returns one entry per invalid key, reporting
     * what the model thought was wrong and what it would have fixed
     * the translation to.
     *
     * This deliberately does NOT go through generateVerificationJSON —
     * that path is designed to *fix* failures and re-verify, so
     * successfully-fixed items come back with failure="" and the check
     * report would miss every issue. Instead we call the verification
     * prompt once per batch, parse the raw schema output, and surface
     * the `valid: false` items directly.
     */
    public async checkJSON(ctx: {
        flatSource: { [key: string]: string };
        flatTarget: { [key: string]: string };
        options: TranslateOptions;
        pool: import("../chat_pool").default;
    }): Promise<
        Array<{
            key: string;
            original: string;
            translated: string;
            issue: string;
            suggestion: string;
        }>
    > {
        const { flatSource, flatTarget, options, pool } = ctx;

        // Build items pre-populated with the on-disk translation — the
        // verify prompt expects both `original` and `translated` to be
        // filled in before it runs.
        const items: TranslateItem[] = [];
        let id = 1;
        for (const key in flatSource) {
            if (
                !Object.prototype.hasOwnProperty.call(flatSource, key) ||
                !(key in flatTarget)
            ) {
                continue;
            }

            const item = this.generateTranslateItem(
                id,
                key,
                flatSource[key],
            );

            item.translated = flatTarget[key];
            item.verificationTokens = this.getVerifyItemToken(item);
            items.push(item);
            id++;
        }

        if (items.length === 0) return [];

        const [chats] = pool.all();
        const issues: Array<{
            key: string;
            original: string;
            translated: string;
            issue: string;
            suggestion: string;
        }> = [];

        // Batch the items to stay within batchSize / batchMaxTokens.
        // getBatchVerifyItemArray already handles token-aware slicing.
        let remaining = items.slice();
        while (remaining.length > 0) {
            const batch = this.getBatchVerifyItemArray(remaining, options);
            if (batch.length === 0) break;
            remaining = remaining.filter((it) => !batch.includes(it));

            const promptText = verificationPromptJSON(
                options.inputLanguageCode,
                options.outputLanguageCode,
                this.generateVerifyItemsInput(batch),
                {
                    context: options.context,
                    overridePrompt: options.overridePrompt,
                    templatedStringPrefix: options.templatedStringPrefix,
                    templatedStringSuffix: options.templatedStringSuffix,
                },
            );

            // eslint-disable-next-line no-await-in-loop
            const raw = await chats.verifyTranslationChat.sendMessage(
                promptText,
                VerifyItemOutputObjectSchema,
            );

            const parsed = this.parseVerificationToJSON(raw);
            const idToItem = new Map(batch.map((i) => [i.id, i]));

            for (const v of parsed) {
                if (!this.isValidVerificationItem(v)) continue;
                if (v.valid) continue;

                const item = idToItem.get(v.id);
                if (!item) continue;

                issues.push({
                    issue: v.issue || "Flagged by verifier",
                    key: item.key,
                    original: item.original,
                    suggestion: v.fixedTranslation ?? "",
                    translated: flatTarget[item.key] ?? "",
                });
            }
        }

        return issues;
    }

    private generateTranslateItemsInput(
        translateItems: TranslateItem[],
    ): TranslateItemInput[] {
        return translateItems.map(
            (translateItem) =>
                ({
                    // Only adds 'context' to the object if it's not empty. Makes the prompt shorter and uses less tokens
                    ...(translateItem.context !== ""
                        ? { context: translateItem.context }
                        : {}),
                    ...(translateItem.failure !== ""
                        ? { failure: translateItem.failure }
                        : {}),
                    id: translateItem.id,
                    original: translateItem.original,
                }) as TranslateItemInput,
        );
    }

    private generateVerifyItemsInput(
        verifyItems: TranslateItem[],
    ): VerifyItemInput[] {
        return verifyItems.map(
            (verifyItem) =>
                ({
                    ...(verifyItem.context !== ""
                        ? { context: verifyItem.context }
                        : {}),
                    ...(verifyItem.failure !== ""
                        ? { failure: verifyItem.failure }
                        : {}),
                    id: verifyItem.id,
                    original: verifyItem.original,
                    translated: verifyItem.translated,
                }) as VerifyItemInput,
        );
    }

    private generateTranslateItem(
        id: number,
        key: string,
        original: string,
    ): TranslateItem {
        const translateItem = {
            context: "",
            failure: "",
            id,
            key,
            original,
            templateStrings: [],
            translated: "",
            translationAttempts: 0,
            translationTokens: 0,
            verificationAttempts: 0,
            verificationTokens: 0,
        } as TranslateItem;

        // Maps the 'placeholders' in the translated object to make sure that none are missing
        const match = original.match(this.templatedStringRegex);
        if (match) {
            translateItem.templateStrings = match;
        }

        // Tokens here are used to estimate accurately the execution time
        translateItem.translationTokens =
            this.getTranslateItemToken(translateItem);

        return translateItem;
    }

    private getBatchTranslateItemArray(
        translateItemArray: TranslateItem[],
        options: TranslateOptions,
    ): TranslateItem[] {
        const promptTokens = this.tikToken.encode(
            translationPromptJSON(
                options.inputLanguageCode,
                options.outputLanguageCode,
                [],
                {
                    context: options.context,
                    overridePrompt: options.overridePrompt,
                    templatedStringPrefix: options.templatedStringPrefix,
                    templatedStringSuffix: options.templatedStringSuffix,
                },
            ),
        ).length;

        // Remove the tokens used by the prompt and divide the remaining tokens divided by 2 (half for the input/output) with a 10% margin of error
        const maxInputTokens =
            ((Number(options.batchMaxTokens) - promptTokens) * 0.9) / 2;

        let currentTokens = 0;

        const batchTranslateItemArray: TranslateItem[] = [];

        for (const translateItem of translateItemArray) {
            // If a failure message is added the tokens for an item change
            currentTokens +=
                translateItem.failure !== ""
                    ? this.getTranslateItemToken(translateItem)
                    : translateItem.translationTokens;

            if (
                batchTranslateItemArray.length !== 0 &&
                (currentTokens >= maxInputTokens ||
                    batchTranslateItemArray.length >= Number(options.batchSize))
            ) {
                break;
            }

            batchTranslateItemArray.push(translateItem);

            if (translateItem.translationAttempts > 5) {
                // Add a minimum of one items if the item has been tried many times
                // Too many items can cause translations to fail
                break;
            }
        }

        return batchTranslateItemArray;
    }

    private getBatchVerifyItemArray(
        translatedItemArray: TranslateItem[],
        options: TranslateOptions,
    ): TranslateItem[] {
        const promptTokens = this.tikToken.encode(
            verificationPromptJSON(
                options.inputLanguageCode,
                options.outputLanguageCode,
                [],
                {
                    context: options.context,
                    overridePrompt: options.overridePrompt,
                    templatedStringPrefix: options.templatedStringPrefix,
                    templatedStringSuffix: options.templatedStringSuffix,
                },
            ),
        ).length;

        const maxInputTokens =
            ((Number(options.batchMaxTokens) - promptTokens) * 0.9) / 2;

        let currentTokens = 0;

        const batchVerifyItemArray: TranslateItem[] = [];

        for (const translatedItem of translatedItemArray) {
            currentTokens +=
                translatedItem.failure !== ""
                    ? this.getVerifyItemToken(translatedItem)
                    : translatedItem.verificationTokens;

            if (
                batchVerifyItemArray.length !== 0 &&
                (currentTokens >= maxInputTokens ||
                    batchVerifyItemArray.length >= Number(options.batchSize))
            ) {
                break;
            }

            batchVerifyItemArray.push(translatedItem);

            if (translatedItem.verificationAttempts > 5) {
                // Add a minimum of one items if the item has been tried many times
                // Too many items can cause translations to fail
                break;
            }
        }

        return batchVerifyItemArray;
    }

    private generateTranslateItemArray(flatInput: any): TranslateItem[] {
        return Object.keys(flatInput).reduce((acc, key) => {
            if (Object.prototype.hasOwnProperty.call(flatInput, key)) {
                acc.push(
                    this.generateTranslateItem(
                        Object.keys(flatInput).indexOf(key) + 1,
                        key,
                        flatInput[key],
                    ),
                );
            }

            return acc;
        }, [] as TranslateItem[]);
    }

    private getTranslateItemToken(translatedItem: TranslateItem): number {
        return this.tikToken.encode(
            JSON.stringify(
                this.generateTranslateItemsInput([translatedItem])[0],
            ),
        ).length;
    }

    private getVerifyItemToken(translatedItem: TranslateItem): number {
        return this.tikToken.encode(
            JSON.stringify(this.generateVerifyItemsInput([translatedItem])[0]),
        ).length;
    }

    private async generateTranslationJSON(
        translateItemArray: TranslateItem[],
        options: TranslateOptions,
        chats: Chats,
        translationStats: TranslationStatsItem,
        rateLimiter?: RateLimiter,
    ): Promise<TranslateItem[]> {
        const generatedTranslation: TranslateItem[] = [];
        // totalItems / totalTokens / batchStartTime are set once by the
        // public translateJSON entry point so parallel shards don't
        // clobber one another's stats.

        const skippedItems: TranslateItem[] = [];

        // translate items are removed from 'translateItemArray' when one is generated
        // this is done to avoid 'losing' items if the model doesn't return one
        while (translateItemArray.length > 0) {
            const batchTranslateItemArray = this.getBatchTranslateItemArray(
                translateItemArray,
                options,
            );

            for (const batchTranslateItem of batchTranslateItemArray) {
                batchTranslateItem.translationAttempts++;
                if (batchTranslateItem.translationAttempts > RETRY_ATTEMPTS) {
                    if (options.continueOnError) {
                        printError(
                            `Skipping key after ${RETRY_ATTEMPTS} failed translation attempts: ${batchTranslateItem.key}`,
                        );
                        const idx = translateItemArray.findIndex(
                            (item) => item.id === batchTranslateItem.id,
                        );

                        if (idx !== -1) translateItemArray.splice(idx, 1);
                        skippedItems.push(batchTranslateItem);
                        continue;
                    }

                    return Promise.reject(
                        new Error(
                            `Item failed to translate too many times: ${JSON.stringify(batchTranslateItem)}. If this persists try a different model`,
                        ),
                    );
                }
            }

            const filteredBatch = batchTranslateItemArray.filter(
                (item) => item.translationAttempts <= RETRY_ATTEMPTS,
            );

            if (filteredBatch.length === 0) continue;

            translationStats.enqueuedItems += filteredBatch.length;

            // eslint-disable-next-line no-await-in-loop
            const result = await this.runTranslationJob({
                chats,
                context: options.context,
                ensureChangedTranslation:
                    options.ensureChangedTranslation as boolean,
                inputLanguageCode: options.inputLanguageCode,
                outputLanguageCode: options.outputLanguageCode,
                overridePrompt: options.overridePrompt,
                rateLimiter,
                skipStylingVerification:
                    options.skipStylingVerification as boolean,
                skipTranslationVerification:
                    options.skipTranslationVerification as boolean,
                templatedStringPrefix: options.templatedStringPrefix as string,
                templatedStringSuffix: options.templatedStringSuffix as string,
                translateItems: filteredBatch,
                verboseLogging: options.verbose as boolean,
            });

            if (!result) {
                return Promise.reject(new Error("Translation job failed"));
            }

            for (const translatedItem of result) {
                // Check if the translated item exists in the untranslated item array
                const index = translateItemArray.findIndex(
                    (item) => item.id === translatedItem.id,
                );

                if (index !== -1) {
                    // If it does remove it from the 'translateItemArray' used to queue items for translation
                    translateItemArray.splice(index, 1);
                    // Prepare the object then add it to results
                    translatedItem.verificationTokens =
                        this.getVerifyItemToken(translatedItem);
                    generatedTranslation.push(translatedItem);
                    translationStats.processedTokens +=
                        translatedItem.translationTokens;
                }

                translationStats.processedItems++;
            }

            printProgress(
                options.skipTranslationVerification
                    ? "Translating"
                    : "Step 1/2 - Translating",
                translationStats.batchStartTime,
                translationStats.totalTokens,
                translationStats.processedTokens,
            );
        }

        printExecutionTime(
            translationStats.batchStartTime,
            "\nTranslation execution time: ",
        );

        if (skippedItems.length > 0) {
            printError(
                `Skipped ${skippedItems.length} key(s) that exhausted retries: ${skippedItems
                    .map((item) => item.key)
                    .join(", ")}`,
            );
        }

        return generatedTranslation;
    }

    private async generateVerificationJSON(
        verifyItemArray: TranslateItem[],
        options: TranslateOptions,
        chats: Chats,
        translationStats: TranslationStatsItem,
        rateLimiter?: RateLimiter,
    ): Promise<TranslateItem[]> {
        const generatedVerification: TranslateItem[] = [];
        // Stats counters are set centrally in translateJSON so concurrent
        // shards don't clobber each other.
        if (translationStats.batchStartTime === 0) {
            translationStats.batchStartTime = Date.now();
        }

        translationStats.totalItems += verifyItemArray.length;
        translationStats.totalTokens += verifyItemArray.reduce(
            (sum, verifyItem) => sum + verifyItem.verificationTokens,
            0,
        );

        while (verifyItemArray.length > 0) {
            const batchVerifyItemArray = this.getBatchVerifyItemArray(
                verifyItemArray,
                options,
            );

            for (const batchVerifyItem of batchVerifyItemArray) {
                batchVerifyItem.verificationAttempts++;
                if (batchVerifyItem.verificationAttempts > RETRY_ATTEMPTS) {
                    if (options.continueOnError) {
                        printError(
                            `Skipping key after ${RETRY_ATTEMPTS} failed verification attempts; accepting unverified translation: ${batchVerifyItem.key}`,
                        );
                        const idx = verifyItemArray.findIndex(
                            (item) => item.id === batchVerifyItem.id,
                        );

                        if (idx !== -1) verifyItemArray.splice(idx, 1);
                        generatedVerification.push(batchVerifyItem);
                        continue;
                    }

                    return Promise.reject(
                        new Error(
                            `Item failed to verify too many times: ${JSON.stringify(batchVerifyItem)}. If this persists try a different model`,
                        ),
                    );
                }
            }

            const filteredVerifyBatch = batchVerifyItemArray.filter(
                (item) => item.verificationAttempts <= RETRY_ATTEMPTS,
            );

            if (filteredVerifyBatch.length === 0) continue;

            translationStats.enqueuedItems += filteredVerifyBatch.length;

            // eslint-disable-next-line no-await-in-loop
            const result = await this.runVerificationJob({
                chats,
                context: options.context,
                ensureChangedTranslation:
                    options.ensureChangedTranslation as boolean,
                inputLanguageCode: options.inputLanguageCode,
                outputLanguageCode: options.outputLanguageCode,
                overridePrompt: options.overridePrompt,
                rateLimiter,
                skipStylingVerification:
                    options.skipStylingVerification as boolean,
                skipTranslationVerification:
                    options.skipTranslationVerification as boolean,
                templatedStringPrefix: options.templatedStringPrefix as string,
                templatedStringSuffix: options.templatedStringSuffix as string,
                translateItems: filteredVerifyBatch,
                verboseLogging: options.verbose as boolean,
            });

            if (!result) {
                return Promise.reject(new Error("Verification job failed"));
            }

            for (const translatedItem of result) {
                const index = verifyItemArray.findIndex(
                    (item) => item.id === translatedItem.id,
                );

                if (index !== -1) {
                    verifyItemArray.splice(index, 1);
                    generatedVerification.push(translatedItem);
                    translationStats.processedTokens +=
                        translatedItem.verificationTokens;
                }

                translationStats.processedItems++;
            }

            printProgress(
                "Step 2/2 - Verifying",
                translationStats.batchStartTime,
                translationStats.totalTokens,
                translationStats.processedTokens,
            );
        }

        printExecutionTime(
            translationStats.batchStartTime,
            "Verification execution time: ",
        );

        return generatedVerification;
    }

    private convertTranslateItemToIndex(
        generatedTranslation: TranslateItem[],
    ): {
        [key: string]: string;
    } {
        return generatedTranslation.reduce(
            (acc, translation) => {
                acc[translation.key] = translation.translated;
                return acc;
            },
            {} as { [key: string]: string },
        );
    }

    private parseTranslationToJSON(outputText: string): TranslateItemOutput[] {
        try {
            return TranslateItemOutputObjectSchema.parse(JSON.parse(outputText))
                .items;
        } catch (error) {
            printError(
                `Error parsing JSON: '${error}', output: '${outputText}'\n`,
            );
            return [];
        }
    }

    private parseVerificationToJSON(outputText: string): VerifyItemOutput[] {
        try {
            return VerifyItemOutputObjectSchema.parse(JSON.parse(outputText))
                .items;
        } catch (error) {
            printError(
                `Error parsing JSON: '${error}', output: '${outputText}'\n`,
            );
            return [];
        }
    }

    private isValidTranslateItem(
        item: TranslateItemOutput,
    ): item is TranslateItemOutput {
        return (
            typeof item.id === "number" &&
            typeof item.translated === "string" &&
            item.id > 0
        );
    }

    private isValidVerificationItem(
        item: VerifyItemOutput,
    ): item is VerifyItemOutput {
        if (!(typeof item.id === "number")) return false;
        if (!(typeof item.valid === "boolean")) return false;
        if (item.id <= 0) return false;
        // 'fixedTranslation' should be a translation if valid is false
        if (
            item.valid === false &&
            !(typeof item.fixedTranslation === "string")
        )
            return false;

        return true;
    }

    private createTranslateItemsWithTranslation(
        untranslatedItems: TranslateItem[],
        translatedItems: TranslateItemOutput[],
    ): TranslateItem[] {
        const output: TranslateItem[] = [];

        for (const untranslatedItem of untranslatedItems) {
            const translatedItem = translatedItems.find(
                (checkTranslatedItem) =>
                    untranslatedItem.id === checkTranslatedItem.id,
            );

            if (translatedItem) {
                untranslatedItem.translated = translatedItem.translated;

                if (translatedItem.translated === "") {
                    untranslatedItem.failure =
                        "The translated value cannot be an empty string";
                    continue;
                }

                const templateStrings =
                    translatedItem.translated.match(
                        this.templatedStringRegex,
                    ) ?? [];

                const missingVariables = getMissingVariables(
                    untranslatedItem.templateStrings,
                    templateStrings,
                );

                if (missingVariables.length !== 0) {
                    // Item is updated with a failure message. This message gives the LLM a context to help it fix the translation.
                    // Without this the same error is made over and over again, with the message the new translation is generally accepted.
                    untranslatedItem.failure = `Ensure all variables are included. The following variables are missing from the previous translation and must be added: '${JSON.stringify(missingVariables)}'`;
                    continue;
                }

                output.push({
                    ...untranslatedItem,
                    failure: "",
                } as TranslateItem);
            }
        }

        return output;
    }

    private createVerifyItemsWithTranslation(
        translatedItemArray: TranslateItem[],
        verifiedItemArray: VerifyItemOutput[],
    ): TranslateItem[] {
        const output: TranslateItem[] = [];

        for (const translatedItem of translatedItemArray) {
            const verifiedItem = verifiedItemArray.find(
                (checkVerifiedItem) =>
                    translatedItem.id === checkVerifiedItem.id,
            );

            if (verifiedItem) {
                if (verifiedItem.valid) {
                    output.push({
                        ...translatedItem,
                        failure: "",
                    } as TranslateItem);
                } else {
                    translatedItem.translated =
                        verifiedItem.fixedTranslation as string;

                    if (verifiedItem.fixedTranslation === "") {
                        translatedItem.failure =
                            "The translated value cannot be an empty string";
                        continue;
                    }

                    const templateStrings =
                        verifiedItem.fixedTranslation.match(
                            this.templatedStringRegex,
                        ) ?? [];

                    const missingVariables = getMissingVariables(
                        translatedItem.templateStrings,
                        templateStrings,
                    );

                    if (missingVariables.length !== 0) {
                        translatedItem.failure = `Must add variables, missing from last translation: '${JSON.stringify(missingVariables)}'`;
                        continue;
                    }

                    // 'translatedItem' is updated and queued again to check if the new fixed translation is valid
                    translatedItem.failure = `Previous issue that should be corrected: '${verifiedItem.issue}'`;
                }
            }
        }

        return output;
    }

    private async runTranslationJob(
        options: GenerateTranslationOptionsJSON,
    ): Promise<TranslateItem[]> {
        const generateState: GenerateStateJSON = {
            fixedTranslationMappings: {},
            generationRetries: 0,
            translationToRetryAttempts: {},
        };

        const generationPromptText = translationPromptJSON(
            options.inputLanguageCode,
            options.outputLanguageCode,
            this.generateTranslateItemsInput(options.translateItems),
            {
                context: options.context,
                keys: options.translateItems.map((it) => it.key),
                overridePrompt: options.overridePrompt,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
            },
        );

        let translated = "";
        try {
            translated = await retryWithBackoff(
                () =>
                    this.generateJob(
                        generationPromptText,
                        options,
                        generateState,
                        TranslateItemOutputObjectSchema,
                    ),
                {
                    maxRetries: RETRY_ATTEMPTS,
                    rateLimiter: options.rateLimiter,
                    verbose: options.verboseLogging,
                },
            );
        } catch (e) {
            printError(`Failed to translate: ${e}\n`);
        }

        const parsedOutput = this.parseTranslationToJSON(translated);
        const validTranslationObjects = parsedOutput.filter(
            this.isValidTranslateItem,
        );

        return this.createTranslateItemsWithTranslation(
            options.translateItems,
            validTranslationObjects,
        );
    }

    private async runVerificationJob(
        options: GenerateTranslationOptionsJSON,
    ): Promise<TranslateItem[]> {
        const generateState: GenerateStateJSON = {
            fixedTranslationMappings: {},
            generationRetries: 0,
            translationToRetryAttempts: {},
        };

        const generationPromptText = verificationPromptJSON(
            options.inputLanguageCode,
            options.outputLanguageCode,
            this.generateVerifyItemsInput(options.translateItems),
            {
                context: options.context,
                overridePrompt: options.overridePrompt,
                templatedStringPrefix: options.templatedStringPrefix,
                templatedStringSuffix: options.templatedStringSuffix,
            },
        );

        let verified = "";
        try {
            verified = await retryWithBackoff(
                () =>
                    this.generateJob(
                        generationPromptText,
                        options,
                        generateState,
                        VerifyItemOutputObjectSchema,
                    ),
                {
                    maxRetries: RETRY_ATTEMPTS,
                    rateLimiter: options.rateLimiter,
                    verbose: options.verboseLogging,
                },
            );
        } catch (e) {
            printError(`Failed to translate: ${e}\n`);
        }

        const parsedOutput = this.parseVerificationToJSON(verified);
        const validTranslationObjects = parsedOutput.filter(
            this.isValidVerificationItem,
        );

        return this.createVerifyItemsWithTranslation(
            options.translateItems,
            validTranslationObjects,
        );
    }

    private verifyGenerationAndRetry(
        generationPromptText: string,
        options: GenerateTranslationOptionsJSON,
        generateState: GenerateStateJSON,
    ): Promise<string> {
        generateState.generationRetries++;
        if (generateState.generationRetries > 10) {
            options.chats.generateTranslationChat.resetChatHistory();
            return Promise.reject(
                new Error(
                    "Failed to generate content due to exception. Resetting history.",
                ),
            );
        }

        printError(`Erroring text = ${generationPromptText}\n`);

        options.chats.generateTranslationChat.rollbackLastMessage();
        return Promise.reject(
            new Error("Failed to generate content due to exception."),
        );
    }

    private async generateJob(
        generationPromptText: string,
        options: GenerateTranslationOptionsJSON,
        generateState: GenerateStateJSON,
        format: ZodType<any, ZodTypeDef, any>,
    ): Promise<string> {
        const text = await options.chats.generateTranslationChat.sendMessage(
            generationPromptText,
            format,
        );

        if (!text) {
            return this.verifyGenerationAndRetry(
                generationPromptText,
                options,
                generateState,
            );
        } else {
            generateState.generationRetries = 0;
        }

        if (options.verboseLogging) {
            printWarn(text);
        }

        return text;
    }
}
