import type OverridePrompt from "./interfaces/override_prompt";
import { CheckTranslateItem, RetranslateItem, TranslateItem } from "./types";

/**
 * Prompt an AI to convert a given input from one language to another
 * @param inputLanguage - The language of the input
 * @param outputLanguage - The language of the output
 * @param input - The input to be translated
 * @param overridePrompt - An optional custom prompt
 * @returns A prompt for the AI to translate the input
 */
export function generationPrompt(
    inputLanguage: string,
    outputLanguage: string,
    translateItems: TranslateItem[],
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

You are given a JSON file containing an array of items to translate.

- Do not change or translate the names of the fields. They must stay exactly as they are: key, originalText, translatedText, and context. Changing any of these field names will result in a failed translation.
- The value of the field 'key' must remain unchanged. It is used to identify which entity has been translated. Modifying it will cause the translation to fail.
- 'originalText' is the text that needs to be translated, do not translate this field it is not needed, but if it is, will NOT result in failure.
- 'translatedText' is the field where you will enter the translation of the 'originalText'.
- 'context' provides additional context for the 'originalText'. If this field is empty, you do not need any additional context. Do not translate this field it is not needed, but if it is, will NOT result in failure.
- The outputted json must be valid json, if it isn't the translation to fail.

Special Instructions:

-Some translations may contain variables in the text, such as {{timeLeft}}. These variables should not be translated or altered in any way. They must remain exactly as they are in the 'originalText'.
-If the 'originalText' does not contain variables, such as {{timeLeft}, ignore these special instructions.

Translate from ${inputLanguage} to ${outputLanguage}.

-Maintain the same text formatting for the translation; failure to do so will result in an error.
-Ensure case sensitivity and whitespace are preserved exactly as they are in the original text. Modifying these will cause the translation to fail.

Return only the original JSON array with your translations in the translatedText field
VERY IMPORTANT: Wrap it in the original triple backticks, if the json is not wrapped correctly for the backticks the translation will fail. 
Do not output anything else, no need for a message before/ after, do not modify any other fields of the JSON object, no notes or anything else.

If the translation fails you will be punished, if it succeeds you will be rewarded.

\`\`\`
${input}
\`\`\`
`;
}

/**
 * Prompt an AI to correct a failed translation
 * @param inputLanguage - The language of the input
 * @param outputLanguage - The language of the output
 * @param input - The input to be translated
 * @returns A prompt for the AI to correct the failed translation
 */
export function failedTranslationPrompt(
    inputLanguage: string,
    outputLanguage: string,
    retranslateInput: RetranslateItem[],
): string {
    const input = JSON.stringify(retranslateInput);
    return `You are a professional translator.

You are given a JSON file containing an array of items to fix.

- Do not change or translate the names of the fields. They must stay exactly as they are: 'key', 'originalText', 'newTranslatedText', 'context', 'invalidTranslatedText' and 'invalidReason'. Changing any of these field names will result in a failed verification.
- The value of the field 'key' must remain unchanged. It is used to identify which entity has been verified. Modifying it will cause the verification to fail.
- 'newTranslatedText' is the field where you will enter the translation of the 'originalText', take into acount the 'invalidTranslatedText' and 'invalidReason' when translating
- 'originalText' is the source of the translated text, 'invalidTranslatedText'. Do not change these two fields, it is not needed, but if it is, will NOT result in failure.
- 'context' provides additional context for the 'originalText'. If this field is empty, you do not need any additional context. Do not translate this field it is not needed, but if it is, will NOT result in failure.
- Very important! The outputted json must be valid json, if it isn't the translation to fail.

Special Instructions:

-Some translations may contain variables in the text, such as {{timeLeft}}. These variables should not be translated or altered in any way. They must remain exactly as they are in the 'originalText'.
-If the 'originalText' does not contain variables, such as {{timeLeft}, ignore these special instructions.

Translate from ${inputLanguage} to ${outputLanguage}.

-Maintain the same text formatting for the translation; failure to do so will result in an error.
-Ensure case sensitivity and whitespace are preserved exactly as they are in the original text. Modifying these will cause the translation to fail.

VERY IMPORTANT: Wrap it in the original triple backticks, if the json is not wrapped correctly with backticks, the verification will fail. 
Do not output anything else, no need for a message before/ after, do not modify any other fields of the JSON object, no notes or anything else.
Do not output scripts or try to automate this task, I am asking you to translate these on your own.
If the verification fails you will be punished, if it succeeds you will be rewarded.

\`\`\`
${input}
\`\`\`
`;
}

/**
 * Prompt an AI to ensure a translation is valid
 * @param inputLanguage - The language of the input
 * @param outputLanguage - The language of the output
 * @param input - The input to be translated
 * @param output - The output of the translation
 * @param overridePrompt - An optional custom prompt
 * @returns A prompt for the AI to verify the translation
 */
export function translationVerificationPrompt(
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

You are given a JSON file containing an array of items to verify.

- Do not change or translate the names of the fields. They must stay exactly as they are: 'key', 'originalText', 'translatedText', 'context', 'invalid' and 'invalidReason'. Changing any of these field names will result in a failed verification.
- The value of the field 'key' must remain unchanged. It is used to identify which entity has been verified. Modifying it will cause the verification to fail.
- 'originalText' is the source of the translated text, 'translatedText'. Do not change these two fields, it is not needed, but if it is, will NOT result in failure.
- 'context' provides additional context for the 'originalText'. If this field is empty, you do not need any additional context. Do not translate this field it is not needed, but if it is, will NOT result in failure.
- Very important! The outputted json must be valid json, if it isn't the translation to fail.

Special Instructions:

-Some translations may contain variables in the text, such as {{timeLeft}}. These variables should not be translated or altered in any way. They must remain exactly as they are in the 'originalText'.
-If the 'originalText' does not contain variables, such as {{timeLeft}, ignore these special instructions.

Verify the translation from ${inputLanguage} to ${outputLanguage}.

Compare the value of each 'originalText' to the value of 'translatedText' and return only the original JSON array with the field 'invalid' set either to the boolean value true or false (not as a string, as a boolean). 
If invalid is true, also add a very small comment in 'invalidReason' to explain why it is invalid, otherwise leave this field empty.
VERY IMPORTANT: Wrap it in the original triple backticks, if the json is not wrapped correctly with backticks, the verification will fail. 
Do not output anything else, no need for a message before/ after, do not modify any other fields of the JSON object, no notes or anything else.
Do not output scripts or try to automate this task, I am asking you to verify these translations on your own.
If the verification fails you will be punished, if it succeeds you will be rewarded.

\`\`\`
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
export function stylingVerificationPrompt(
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

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCsv}
\`\`\`
`;
}
