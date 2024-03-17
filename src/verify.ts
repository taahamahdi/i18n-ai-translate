import { retryJob } from "./utils";
import type ChatInterface from "./chat_interface/chat_interface";

const translationVerificationPrompt = (
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    output: string,
): string => {
    const splitInput = input.split("\n");
    const splitOutput = output.split("\n");
    const mergedCsv = splitInput
        .map((x, i) => `${x},${splitOutput[i]}`)
        .join("\n");

    return `
Given a translation from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations are poorly translated. Otherwise, reply with ACK. Only reply with ACK/NAK.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCsv}
\`\`\`
`;
};

const stylingVerificationPrompt = (
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    output: string,
): string => {
    const splitInput = input.split("\n");
    const splitOutput = output.split("\n");
    const mergedCsv = splitInput
        .map((x, i) => `${x},${splitOutput[i]}`)
        .join("\n");

    return `
Given text from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations do not match the formatting of the original. Check for differing capitalization, punctuation, or whitespaces. Otherwise, reply with ACK. Only reply with ACK/NAK.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCsv}
\`\`\`
`;
};

/**
 * Confirm whether a given translation is valid
 * @param chat - the chat session
 * @param inputLanguage - the language of the input
 * @param outputLanguage - the language of the output
 * @param input - the input text
 * @param outputToVerify - the output text to verify
 */
export async function verifyTranslation(
    chat: ChatInterface,
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    outputToVerify: string,
): Promise<string> {
    const translationVerificationPromptText = translationVerificationPrompt(
        inputLanguage,
        outputLanguage,
        input,
        outputToVerify,
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
 */
export async function verifyStyling(
    chat: ChatInterface,
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    outputToVerify: string,
): Promise<string> {
    const stylingVerificationPromptText = stylingVerificationPrompt(
        inputLanguage,
        outputLanguage,
        input,
        outputToVerify,
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

                if (text !== "ACK" && text !== "NAK") {
                    return Promise.reject(new Error("Invalid response"));
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
