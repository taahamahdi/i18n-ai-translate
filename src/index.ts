// #!/usr/bin/env node
/* eslint-disable import/no-import-module-exports */
import { check } from "./check";
import { createCache, loadCache, saveCache } from "./cache";
import { translate, translateDiff } from "./translate";

export {
    check,
    createCache,
    loadCache,
    saveCache,
    translate,
    translateDiff,
};
export type { TranslationCache } from "./cache";

module.exports = {
    check,
    createCache,
    loadCache,
    saveCache,
    translate,
    translateDiff,
};
