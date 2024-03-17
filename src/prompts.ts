/**
 * Prompt an AI to convert a given input from one language to another
 * @param inputLanguage - The language of the input
 * @param outputLanguage - The language of the output
 * @param input - The input to be translated
 * @returns A prompt for the AI to translate the input
 */
export function generationPrompt(
    inputLanguage: string,
    outputLanguage: string,
    input: string,
): string {
    return `You are a professional translator.

Translate each line from ${inputLanguage} to ${outputLanguage}.

Return translations in the same text formatting.

Maintain case sensitivity and whitespacing.

Output only the translations.

All lines should start and end with an ASCII quotation mark (").

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
    input: string,
): string {
    return `You are a professional translator.

The following translation from ${inputLanguage} to ${outputLanguage} failed.

Attempt to translate it to ${outputLanguage} by considering it as a concatenation of ${inputLanguage} words, or re-interpreting it such that it makes sense in ${outputLanguage}.

Return only the translation with no additional formatting, apart from returning it in quotes.

Maintain case sensitivity and whitespacing.

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
 * @returns A prompt for the AI to verify the translation
 */
export function translationVerificationPrompt(
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    output: string,
): string {
    const splitInput = input.split("\n");
    const splitOutput = output.split("\n");
    const mergedCsv = splitInput
        .map((x, i) => `${x},${splitOutput[i]}`)
        .join("\n");

    return `
Given a translation from ${inputLanguage} to ${outputLanguage} in CSV form, reply with NAK if _any_ of the translations are poorly translated.

Otherwise, reply with ACK.

Only reply with ACK/NAK.

\`\`\`
${inputLanguage},${outputLanguage}
${mergedCsv}
\`\`\`
`;
}

/**
 * Prompt an AI to ensure a translation is styled correctly
 * @param inputLanguage - The language of the input
 * @param outputLanguage - The language of the output
 * @param input - The input to be translated
 * @param output - The output of the translation
 * @returns A prompt for the AI to verify the translation
 */
export function stylingVerificationPrompt(
    inputLanguage: string,
    outputLanguage: string,
    input: string,
    output: string,
): string {
    const splitInput = input.split("\n");
    const splitOutput = output.split("\n");
    const mergedCsv = splitInput
        .map((x, i) => `${x},${splitOutput[i]}`)
        .join("\n");

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
