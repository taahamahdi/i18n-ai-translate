import { retryJob } from "./utils";
import { failedTranslationPrompt } from "./prompts";
import type ChatInterface from "./chat_interface/chat_interface";
import { RetranslateItem } from "./types";

/**
 * Confirm whether a given translation is valid
 * @param chat - the chat session
 * @param inputLanguage - the language of the input
 * @param outputLanguage - the language of the output
 * @param verificationInput - the input item
 * @param outputToVerify - the output text to verify
 */
export async function fixTranslation(
    chat: ChatInterface,
    inputLanguage: string,
    outputLanguage: string,
    retranslateInput: RetranslateItem[],
): Promise<string> {
    const translationVerificationPromptText = failedTranslationPrompt(
        inputLanguage,
        outputLanguage,
        retranslateInput,
    );

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return fix(chat, translationVerificationPromptText);
}

// /**
//  * Confirm whether a translation maintains the original styling
//  * @param chat - the chat session
//  * @param inputLanguage - the language of the input
//  * @param outputLanguage - the language of the output
//  * @param input - the input text
//  * @param outputToVerify - the output text to verify
//  * @param overridePrompt - An optional custom prompt
//  */
// export async function verifyStyling(
//     chat: ChatInterface,
//     inputLanguage: string,
//     outputLanguage: string,
//     input: string,
//     outputToVerify: string,
//     overridePrompt?: OverridePrompt,
// ): Promise<string> {
//     const stylingVerificationPromptText = stylingVerificationPrompt(
//         inputLanguage,
//         outputLanguage,
//         input,
//         outputToVerify,
//         overridePrompt,
//     );

//     // eslint-disable-next-line @typescript-eslint/no-use-before-define
//     return verify(chat, stylingVerificationPromptText);
// }

const fix = async (
    chat: ChatInterface,
    fixTranslationPromptText: string,
): Promise<string> => {
    let fix = "";
    try {
        fix = await retryJob(
            async (): Promise<string> => {
                const text = await chat.sendMessage(fixTranslationPromptText);

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
        console.error(`Failed to fix: ${e}`);
    }

    return fix;
};
