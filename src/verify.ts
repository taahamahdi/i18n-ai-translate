import { retryJob } from "./utils";
import {
    stylingVerificationPrompt,
    translationVerificationPrompt,
} from "./prompts";
import type ChatInterface from "./chat_interface/chat_interface";
import type OverridePrompt from "./interfaces/override_prompt";
import { CheckTranslateItem } from "./types";

/**
 * Confirm whether a given translation is valid
 * @param chat - the chat session
 * @param inputLanguage - the language of the input
 * @param outputLanguage - the language of the output
 * @param input - the input text
 * @param outputToVerify - the output text to verify
 * @param overridePrompt - An optional custom prompt
 */
export async function verifyTranslation(
    chat: ChatInterface,
    inputLanguage: string,
    outputLanguage: string,
    verificationInput: CheckTranslateItem[],
    overridePrompt?: OverridePrompt,
): Promise<string> {
    const translationVerificationPromptText = translationVerificationPrompt(
        inputLanguage,
        outputLanguage,
        verificationInput,
        overridePrompt,
    );

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return verify(chat, translationVerificationPromptText);
}

/**
 * Confirm whether a translation maintains the original styling
 * @param chat - the chat session
 * @param inputLanguage - the language of the input
 * @param outputLanguage - the language of the output
 * @param input - the input text
 * @param outputToVerify - the output text to verify
 * @param overridePrompt - An optional custom prompt
 */
export async function verifyStyling(
    chat: ChatInterface,
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    outputToVerify: string,
    overridePrompt?: OverridePrompt,
): Promise<string> {
    const stylingVerificationPromptText = stylingVerificationPrompt(
        inputLanguage,
        outputLanguage,
        input,
        outputToVerify,
        overridePrompt,
    );

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return verify(chat, stylingVerificationPromptText);
}

const verify = async (
    chat: ChatInterface,
    verificationPromptText: string,
): Promise<string> => {
    let verification = "";
    try {
        verification = await retryJob(
            async (): Promise<string> => {
                const text = await chat.sendMessage(verificationPromptText);

                if (text === "") {
                    return Promise.reject(
                        new Error("Failed to generate content"),
                    );
                }

                return text;
            },
            [],
            5,
            true,
            0,
            false,
        );
    } catch (e) {
        console.error(`Failed to verify: ${e}`);
    }

    return verification;
};

// const verificationInput = createValidateTranslateItemArray(
//     options.translateItems,
//     parsedOutput.filter(isValidTranslateItem),
// );

// if (!options.skipTranslationVerification) {
//     await verifyTranslationAndFix(
//         verificationInput,
//         options,
//         verificationInput,
//     );
// }

// let stylingVerificationResponse = "";
// if (!options.skipStylingVerification) {
//     stylingVerificationResponse = await verifyStyling(
//         chats.verifyStylingChat,
//         inputLanguage,
//         outputLanguage,
//         input,
//         text,
//         options.overridePrompt,
//     );
// }

// if (isNAK(stylingVerificationResponse)) {
//     chats.generateTranslationChat.invalidStyling();
//     return Promise.reject(new Error(`Invalid styling. text = ${text}`));
// }

// async function verifyTranslationAndFix(
//     verificationInput: CheckTranslateItem[],
//     options: GenerateTranslationOptions,
//     input: CheckTranslateItem[],
// ) {
//     const translationVerificationResponse = await verifyTranslation(
//         options.chats.verifyTranslationChat,
//         options.inputLanguage,
//         options.outputLanguage,
//         input,
//         options.overridePrompt,
//     );

//     const parsedOutput = parseOutputToJson(
//         translationVerificationResponse,
//         options,
//     ) as CheckTranslateItem[];

//     const validatedTranslateItemArray = createValidatedTranslateItemArray(
//         verificationInput,
//         parsedOutput.filter(isValidCheckTranslateItem),
//     );

//     const invalidTranslations = validatedTranslateItemArray.filter(
//         (validatedTranslateItem) => validatedTranslateItem.invalid,
//     );

//     if (invalidTranslations) {
//         console.log(invalidTranslations);
//         const retranslateInput = invalidTranslations.map(
//             (invalidTranslation) =>
//                 ({
//                     context: invalidTranslation.context,
//                     invalidReason: invalidTranslation.invalidReason,
//                     invalidTranslatedText: invalidTranslation.translatedText,
//                     key: invalidTranslation.key,
//                     newTranslatedText: "",
//                     originalText: invalidTranslation.originalText,
//                 }) as RetranslateItem,
//         );

//         const fixedTranslations = await fixTranslation(
//             options.chats.verifyTranslationChat,
//             options.inputLanguage,
//             options.outputLanguage,
//             retranslateInput,
//         );

//         console.log(fixedTranslations);
//     } else {
//         console.log("nothing to fix");
//     }
// }

// function isValidCheckTranslateItem(item: any): item is CheckTranslateItem {
//     return (
//         typeof item.key === "string" &&
//         typeof item.originalText === "string" &&
//         typeof item.translatedText === "string" &&
//         typeof item.context === "string" &&
//         (typeof item.invalid === "boolean" || item.invalid === null) &&
//         typeof item.invalidReason === "string"
//     );
// }

// function isValidRetranslateItem(item: any): item is RetranslateItem {
//     return (
//         typeof item.key === "string" &&
//         typeof item.originalText === "string" &&
//         typeof item.newTranslatedText === "string" &&
//         typeof item.context === "string" &&
//         typeof item.invalidTranslatedText === "string" &&
//         typeof item.invalidReason === "string"
//     );
// }

// function createValidateTranslateItemArray(
//     untranslatedItems: TranslateItem[],
//     translatedItems: TranslateItem[],
// ): CheckTranslateItem[] {
//     const verificationOutput: CheckTranslateItem[] = [];

//     for (const untranslatedItem of untranslatedItems) {
//         const translatedItem = translatedItems.find(
//             (checkTranslatedItem) =>
//                 untranslatedItem.key === checkTranslatedItem.key,
//         );

//         if (translatedItem) {
//             verificationOutput.push({
//                 context: untranslatedItem.context,
//                 invalid: null,
//                 invalidReason: "",
//                 key: untranslatedItem.key,
//                 originalText: untranslatedItem.originalText,
//                 translatedText: translatedItem.translatedText,
//             } as CheckTranslateItem);
//         }
//     }

//     return verificationOutput;
// }

// function createValidatedTranslateItemArray(
//     checkTranslateItems: CheckTranslateItem[],
//     verifiedTranslateItems: CheckTranslateItem[],
// ): CheckTranslateItem[] {
//     const verificationOutput: CheckTranslateItem[] = [];

//     for (const checkTranslateItem of checkTranslateItems) {
//         const verifiedTranslateItem = verifiedTranslateItems.find(
//             (checkVerifiedTranslateItem) =>
//                 checkTranslateItem.key === checkVerifiedTranslateItem.key,
//         );

//         if (verifiedTranslateItem) {
//             verificationOutput.push({
//                 context: checkTranslateItem.context,
//                 invalid: verifiedTranslateItem.invalid,
//                 invalidReason: verifiedTranslateItem.invalidReason,
//                 key: checkTranslateItem.key,
//                 originalText: checkTranslateItem.originalText,
//                 translatedText: checkTranslateItem.translatedText,
//             } as CheckTranslateItem);
//         }
//     }

//     return verificationOutput;
// }
