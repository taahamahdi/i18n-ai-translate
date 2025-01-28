export const OverridePromptKeys: string[] = [
    "generationPrompt",
    "translationVerificationPrompt",
    "stylingVerificationPrompt",
];

export default interface OverridePrompt {
    generationPrompt: string;
    translationVerificationPrompt: string;
    stylingVerificationPrompt: string;
}
