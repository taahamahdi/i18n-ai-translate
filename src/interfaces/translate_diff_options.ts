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
     *
     * `translated` is the unflattened per-language object (file diff
     * callers write this straight to disk); `flatTranslated` is the
     * pre-unflatten flat map (directory diff callers split it on the
     * `filepath:key` delimiter their keys are encoded with).
     */
    onLanguageComplete?: (
        languageCode: string,
        translated: Object,
        flatTranslated: { [key: string]: string },
    ) => void;
}
