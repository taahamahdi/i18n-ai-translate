import type {
    CheckTranslateItem,
    RetranslateItem,
    TranslateItemInput,
} from "./types_json";
import type OverridePrompt from "src/interfaces/override_prompt";

/**
 * Prompt an AI to convert a given input from one language to another
 * @param inputLanguage - The language of the input
 * @param outputLanguage - The language of the output
 * @param translateItems - The input to be translated
 * @param overridePrompt - An optional custom prompt
 * @returns A prompt for the AI to translate the input
 */
export function generationPromptJson(
    inputLanguage: string,
    outputLanguage: string,
    translateItems: TranslateItemInput[],
    overridePrompt?: OverridePrompt,
): string {
    const customPrompt = overridePrompt?.generationPrompt;
    const requiredArguments = ["inputLanguage", "outputLanguage", "input"];
    const input = JSON.stringify(translateItems);

    if (customPrompt) {
        for (const arg of requiredArguments) {
            if (!customPrompt.includes(`\${${arg}}`)) {
                throw new Error(`Missing required argument: \${${arg}}`);
            }
        }

        const argumentToValue: { [key: string]: string } = {
            input,
            inputLanguage,
            outputLanguage,
        };

        return customPrompt.replace(/\$\{([^}]+)\}/g, (match, key) =>
            key in argumentToValue ? argumentToValue[key] : match,
        );
    }

    return `You are a professional translator.

Translate from ${inputLanguage} to ${outputLanguage}.

- Translate each object in the array.
- 'original' is the text to be translated. 
- 'translated' must not be empty. 
- 'context' is additional info if needed.
- Preserve text formatting, case sensitivity, and whitespace.

Special Instructions:
- Do not translate or alter variables like {{timeLeft}}, Ignore this if 'original' lacks variables.
- Do not convert {{NEWLINE}} to \\n.

Return the translation as JSON.
\`\`\`json
${input}
\`\`\`
`;
}

/**
 * Prompt an AI to correct a failed translation
 * @param inputLanguage - The language of the input
 * @param outputLanguage - The language of the output
 * @param retranslateInput - The input to be translated
 * @returns A prompt for the AI to correct the failed translation
 */
export function failedTranslationPromptJson(
    inputLanguage: string,
    outputLanguage: string,
    retranslateInput: RetranslateItem[],
): string {
    const input = JSON.stringify(retranslateInput);
    return `You are a professional translator.

Translate from ${inputLanguage} to ${outputLanguage}.

You are given a JSON file containing an array of items to fix.

- Do not change or translate the names of the fields. They must stay exactly as they are: 'key', 'originalText', 'newTranslatedText', 'context', 'invalidTranslatedText' and 'invalidReason'. Changing any of these field names will result in a failed verification.
- The value of the field 'key' must remain unchanged. It is used to identify which entity has been verified. Modifying it will cause the verification to fail.
- 'newTranslatedText' is the field where you will enter the translation of the 'originalText', take into acount the 'invalidTranslatedText' and 'invalidReason' when translating
- 'originalText' is the source of the translated text, 'invalidTranslatedText'. Do not change these two fields, it is not needed, but if it is, will NOT result in failure.
- 'context' provides additional context for the 'originalText'. If this field is empty, you do not need any additional context. Do not translate this field it is not needed, but if it is, will NOT result in failure.

\`\`\`json
${input}
\`\`\`
`;
}

/**
 * Prompt an AI to ensure a translation is valid
 * @param inputLanguage - The language of the input
 * @param outputLanguage - The language of the output
 * @param verificationInput - The input to be translated
 * @param overridePrompt - An optional custom prompt
 * @returns A prompt for the AI to verify the translation
 */
export function translationVerificationPromptJson(
    inputLanguage: string,
    outputLanguage: string,
    verificationInput: CheckTranslateItem[],
    overridePrompt?: OverridePrompt,
): string {
    const input = JSON.stringify(verificationInput);
    const customPrompt = overridePrompt?.translationVerificationPrompt;
    const requiredArguments = ["inputLanguage", "outputLanguage", "mergedCsv"];
    if (customPrompt) {
        for (const arg of requiredArguments) {
            if (!customPrompt.includes(`\${${arg}}`)) {
                throw new Error(`Missing required argument: \${${arg}}`);
            }
        }

        const argumentToValue: { [key: string]: string } = {
            inputLanguage,
            outputLanguage,
        };

        return customPrompt.replace(/\$\{([^}]+)\}/g, (match, key) =>
            key in argumentToValue ? argumentToValue[key] : match,
        );
    }

    return `You are a professional translator.

Verify the translation from ${inputLanguage} to ${outputLanguage}.

You are given a JSON file containing an array of items to verify.

- Do not change or translate the names of the fields. They must stay exactly as they are: 'key', 'originalText', 'translatedText', 'context', 'invalid' and 'invalidReason'. Changing any of these field names will result in a failed verification.
- The value of the field 'key' must remain unchanged. It is used to identify which entity has been verified. Modifying it will cause the verification to fail.
- 'originalText' is the source of the translated text, 'translatedText'. Do not change these two fields, it is not needed, but if it is, will NOT result in failure.
- 'context' provides additional context for the 'originalText'. If this field is empty, you do not need any additional context. Do not translate this field it is not needed, but if it is, will NOT result in failure.

Compare the value of each 'originalText' to the value of 'translatedText' and return only the original JSON array with the field 'invalid' set either to the boolean value true or false (not as a string, as a boolean). 
If invalid is true, also add a very small comment in 'invalidReason' to explain why it is invalid, otherwise leave this field empty.

\`\`\`json
${input}
\`\`\`
`;
}

/**
 * Prompt an AI to ensure a translation is styled correctly
 * @param inputLanguage - The language of the input
 * @param outputLanguage - The language of the output
 * @param input - The input to be translated
 * @param output - The output of the translation
 * @param overridePrompt - An optional custom prompt
 * @returns A prompt for the AI to verify the translation
 */
export function stylingVerificationPromptJson(
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    output: string,
    overridePrompt?: OverridePrompt,
): string {
    const splitInput = input.split("\n");
    const splitOutput = output.split("\n");
    const mergedCsv = splitInput
        .map((x, i) => `${x},${splitOutput[i]}`)
        .join("\n");

    const customPrompt = overridePrompt?.stylingVerificationPrompt;
    const requiredArguments = ["inputLanguage", "outputLanguage", "mergedCsv"];
    if (customPrompt) {
        for (const arg of requiredArguments) {
            if (!customPrompt.includes(`\${${arg}}`)) {
                throw new Error(`Missing required argument: \${${arg}}`);
            }
        }

        const argumentToValue: { [key: string]: string } = {
            inputLanguage,
            mergedCsv,
            outputLanguage,
        };

        return customPrompt.replace(/\$\{([^}]+)\}/g, (match, key) =>
            key in argumentToValue ? argumentToValue[key] : match,
        );
    }

    return `
Given text from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations do not match the formatting of the original.

Check for differing capitalization, punctuation, or whitespaces.

Otherwise, reply with ACK.

Only reply with ACK/NAK.

\`\`\`json
${inputLanguage},${outputLanguage}
${mergedCsv}
\`\`\`
`;
}
