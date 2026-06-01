/**
 * Minimal table of Gettext Plural-Forms rules keyed by ISO-639-1 code.
 * The `categories` array is the CLDR plural-category name for each
 * index `i` in `msgstr[i]`. The `forms` string is the literal value
 * for the `Plural-Forms:` header on write.
 *
 * Covers the common languages a first-pass user is likely to target.
 * Unknown codes fall back to 2-form English-style via `DEFAULT_RULE`.
 * Expanding coverage is additive — it doesn't require touching the
 * adapter logic.
 *
 * Source: GNU gettext manual & Mozilla Localization plural rules.
 */
export type PluralRule = {
    /** Number of msgstr slots for a plural entry in this language. */
    nplurals: number;
    /** CLDR category name at each msgstr index. */
    categories: readonly PluralCategory[];
    /** Value to write into the `Plural-Forms:` header. */
    forms: string;
};

export type PluralCategory =
    | "zero"
    | "one"
    | "two"
    | "few"
    | "many"
    | "other";

export const DEFAULT_RULE: PluralRule = {
    categories: ["one", "other"],
    forms: "nplurals=2; plural=(n != 1);",
    nplurals: 2,
};

export const PLURAL_RULES: Record<string, PluralRule> = {
    ar: {
        categories: ["zero", "one", "two", "few", "many", "other"],
        forms: "nplurals=6; plural=(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5);",
        nplurals: 6,
    },
    cs: {
        categories: ["one", "few", "other"],
        forms: "nplurals=3; plural=((n==1) ? 0 : (n>=2 && n<=4) ? 1 : 2);",
        nplurals: 3,
    },
    de: DEFAULT_RULE,
    en: DEFAULT_RULE,
    es: DEFAULT_RULE,
    fr: {
        categories: ["one", "other"],
        forms: "nplurals=2; plural=(n > 1);",
        nplurals: 2,
    },
    it: DEFAULT_RULE,
    ja: {
        categories: ["other"],
        forms: "nplurals=1; plural=0;",
        nplurals: 1,
    },
    ko: {
        categories: ["other"],
        forms: "nplurals=1; plural=0;",
        nplurals: 1,
    },
    nl: DEFAULT_RULE,
    pl: {
        categories: ["one", "few", "many"],
        forms: "nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
        nplurals: 3,
    },
    pt: {
        categories: ["one", "other"],
        forms: "nplurals=2; plural=(n != 1);",
        nplurals: 2,
    },
    ru: {
        categories: ["one", "few", "many"],
        forms: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
        nplurals: 3,
    },
    tr: {
        categories: ["one", "other"],
        forms: "nplurals=2; plural=(n > 1);",
        nplurals: 2,
    },
    uk: {
        categories: ["one", "few", "many"],
        forms: "nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);",
        nplurals: 3,
    },
    vi: {
        categories: ["other"],
        forms: "nplurals=1; plural=0;",
        nplurals: 1,
    },
    zh: {
        categories: ["other"],
        forms: "nplurals=1; plural=0;",
        nplurals: 1,
    },
};

/**
 * @param languageCode - ISO-639-1 code (case-insensitive)
 * @returns the plural rule for the language, or `DEFAULT_RULE`
 */
export function getPluralRule(languageCode: string): PluralRule {
    return PLURAL_RULES[languageCode.toLowerCase()] ?? DEFAULT_RULE;
}
