import { ChatSession } from "@google/generative-ai";
import { retryJob } from "./utils";

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

**Be as nitpicky as possible**.

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
Given text from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations do not match the formatting of the original (differing capitalization, punctuation, or whitespaces). Otherwise, reply with ACK. Only reply with ACK/NAK.

**Be as nitpicky as possible.**

\`\`\`
${mergedCsv}
\`\`\`
`;
};

export async function verifyTranslation(
    chat: ChatSession,
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

    return verify(chat, translationVerificationPromptText);
}

export async function verifyStyling(
    chat: ChatSession,
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

    return verify(chat, stylingVerificationPromptText);
}

const verify = async (
    chat: ChatSession,
    verificationPromptText: string,
): Promise<string> => {
    let verification = "";
    try {
        verification = await retryJob(
            async (): Promise<string> => {
                const generatedContent = await chat.sendMessage(
                    verificationPromptText,
                );
                const text = generatedContent.response.text();
                if (text === "") {
                    return Promise.reject("Failed to generate content");
                }

                if (text !== "ACK" && text !== "NAK") {
                    return Promise.reject("Invalid response");
                }

                return text;
            },
            [],
            5,
            true,
            500,
            false,
        );
    } catch (e) {
        console.error(`Failed to verify: ${e}`);
    }

    return verification;
};
