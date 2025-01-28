export default interface OverridePrompt {
    generationPrompt: string;
    translationVerificationPrompt: string;
    stylingVerificationPrompt: string;
}

export const OVERRIDE_PROMPT_KEYS: Array<keyof OverridePrompt> = [
    "generationPrompt",
    "translationVerificationPrompt",
    "stylingVerificationPrompt",
];
