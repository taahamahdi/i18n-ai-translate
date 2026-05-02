import type Options from "./options";

export default interface TranslateDiffOptions extends Options {
    inputLanguageCode: string;
    inputJSONBefore: Object;
    inputJSONAfter: Object;
    toUpdateJSONs: { [languageCode: string]: Object };
    /**
     * Called after each per-language translation finishes. Lets callers
     * persist partial results to disk so a crash mid-run doesn't
     * discard already-paid-for translations.
     */
    onLanguageComplete?: (languageCode: string, translated: Object) => void;
}
