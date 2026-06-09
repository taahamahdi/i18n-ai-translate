/**
 * A glossary steers terminology during translation. Both fields are
 * optional and are injected into the model prompts (generation and
 * verification) — enforcement is prompt-based, like `--context`.
 */
export default interface Glossary {
    /**
     * Terms that must be kept verbatim in every target language — brand
     * names, product names, trademarks, code identifiers, etc.
     */
    doNotTranslate?: string[];
    /**
     * Forced translations, keyed by target language code, then by source
     * term. e.g. `{ fr: { Account: "Compte" }, es: { Account: "Cuenta" } }`.
     * Only the entry matching the run's output language is applied.
     */
    terms?: { [languageCode: string]: { [source: string]: string } };
}
