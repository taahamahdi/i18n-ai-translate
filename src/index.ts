// #!/usr/bin/env node
/* eslint-disable import/no-import-module-exports */
import { check } from "./check";
import { createCache, loadCache, saveCache } from "./cache";
import { loadGlossary } from "./glossary";
import { translate, translateDiff } from "./translate";

export {
    check,
    createCache,
    loadCache,
    loadGlossary,
    saveCache,
    translate,
    translateDiff,
};
export type { TranslationCache } from "./cache";
export type { default as Glossary } from "./interfaces/glossary";

module.exports = {
    check,
    createCache,
    loadCache,
    loadGlossary,
    saveCache,
    translate,
    translateDiff,
};
