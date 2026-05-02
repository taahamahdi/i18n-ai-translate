import ISO6391 from "iso-639-1";
import ansiColors from "ansi-colors";
import fs from "fs";
import path from "path";

/**
 * @param delayDuration - time (in ms) to delay
 * @returns a promise that resolves after delayDuration
 */
export function delay(delayDuration: number): Promise<void> {
    // eslint-disable-next-line no-promise-executor-return
    return new Promise((resolve) => setTimeout(resolve, delayDuration));
}

/**
 * @param error - the error message
 */
export function printError(error: string): void {
    console.error(ansiColors.redBright(error));
}

/**
 * @param warn - the warning message
 */
export function printWarn(warn: string): void {
    console.warn(ansiColors.yellowBright(warn));
}

/**
 * @param info - the message
 */
export function printInfo(info: string): void {
    console.log(ansiColors.cyanBright(info));
}

/**
 * @param job - the function to retry
 * @param jobArgs - arguments to pass to job
 * @param maxRetries - retries of job before throwing
 * @param firstTry - whether this is the first try
 * @param delayDuration - time (in ms) before attempting job retry
 * @param sendError - whether to send a warning or error
 * @returns the result of job
 */
export async function retryJob<Type>(
    job: (...args: any) => Promise<Type>,
    jobArgs: Array<any>,
    maxRetries: number,
    firstTry: boolean,
    delayDuration?: number,
    sendError = true,
): Promise<Type> {
    if (!firstTry && delayDuration) {
        await delay(delayDuration);
    }

    return job(...jobArgs).catch((err) => {
        if (sendError) {
            printError(`err = ${err}`);
        } else {
            printWarn(`err = ${err}`);
        }

        if (maxRetries <= 0) {
            throw err;
        }

        return retryJob(job, jobArgs, maxRetries - 1, false, delayDuration);
    });
}

/**
 * Extract the language code from a filename like `fr.json` or
 * `es-ES.json`. If the full prefix (e.g. `es-ES`) is not a valid
 * ISO-639-1 code, fall back to the portion before the first hyphen —
 * BCP-47 locale tags like `es-ES` / `pt-BR` / `zh-CN` are common in
 * i18next projects and should be accepted. If neither form is valid,
 * the raw prefix is returned so the caller can surface a clear error.
 * @param filename - the filename to get the language from
 * @returns the language code from the filename
 */
export function getLanguageCodeFromFilename(filename: string): string {
    const base = path.basename(filename);
    const [prefix] = base.split(".");
    if (ISO6391.validate(prefix)) return prefix;

    const [baseTag] = prefix.split("-");
    if (ISO6391.validate(baseTag)) return baseTag;

    return prefix;
}

/**
 * @returns all language codes
 */
export function getAllLanguageCodes(): string[] {
    return ISO6391.getAllCodes();
}

/**
 * @param languageCode - the language code to validate
 * @returns whether the language code is valid
 */
export function isValidLanguageCode(languageCode: string): boolean {
    return ISO6391.validate(languageCode);
}

/**
 * Expand an ISO-639-1 code to its English display name (e.g. "en" →
 * "English"). Used in prompts because language names steer the LLM
 * much better than the two-letter code does. Falls back to the raw
 * code if the lookup fails so prompts never break.
 * @param languageCode - the ISO-639-1 code
 * @returns the English display name, or the raw code if unknown
 */
export function getLanguageName(languageCode: string): string {
    const name = ISO6391.getName(languageCode);
    return name || languageCode;
}

/**
 * Accept both ISO-639-1 codes ("en") and English language names
 * ("English", "english", "ENGLISH") and normalise to the code. Returns
 * the input unchanged when no match is found so the caller's existing
 * validation can surface a clear error.
 *
 * This covers a common footgun flagged in BUG_REPORT.md and issue #5 —
 * users passed `-l English` based on older docs and got a cryptic
 * 'Invalid input language code: English' instead of a hint.
 * @param raw - the user-supplied language identifier
 * @returns the resolved ISO-639-1 code, or the raw input if unresolved
 */
export function resolveLanguageCode(raw: string): string {
    if (!raw) return raw;
    if (ISO6391.validate(raw)) return raw;

    const normalized = raw.trim().toLowerCase();
    for (const code of ISO6391.getAllCodes()) {
        if (ISO6391.getName(code).toLowerCase() === normalized) {
            return code;
        }
    }

    return raw;
}

/**
 * @param directory - the directory to list all files for
 * @returns all files with their absolute path that exist within the directory, recursively
 */
export function getAllFilesInPath(directory: string): Array<string> {
    const files: Array<string> = [];
    for (const fileOrDir of fs.readdirSync(directory)) {
        const fullPath = path.join(directory, fileOrDir);
        if (fs.lstatSync(fullPath).isDirectory()) {
            files.push(...getAllFilesInPath(fullPath));
        } else {
            files.push(fullPath);
        }
    }

    return files;
}

/**
 * ASCII Unit Separator (0x1F). Used to join a file path with an i18n
 * key into a single compound key string. Chosen because no legal file
 * path on any platform can contain it — unlike `:`, which is a drive
 * letter separator on Windows and broke directory mode on that OS.
 */
export const DIRECTORY_KEY_DELIMITER = "\x1f";

/**
 * @param sourceFilePath - the source file's path
 * @param key - the key associated with the translation
 * @param inputLanguageCode - the language code of the source language
 * @param outputLanguageCode - the language code of the output language
 * @returns a key to use when translating a key from a directory;
 * swaps the input language code with the output language code
 */
export function getTranslationDirectoryKey(
    sourceFilePath: string,
    key: string,
    inputLanguageCode: string,
    outputLanguageCode?: string,
): string {
    // Normalize to forward slashes for the language-segment match so
    // the swap works on Windows (where path.resolve returns backslash
    // paths) and POSIX alike. Callers treat the returned string as an
    // opaque compound key; consumers that split on DIRECTORY_KEY_DELIMITER
    // use path utilities rather than depending on separator style.
    const normalized = sourceFilePath.replace(/\\/g, "/");
    const outputPath = normalized.replace(
        `/${inputLanguageCode}/`,
        `/${outputLanguageCode ?? inputLanguageCode}/`,
    );

    return `${outputPath}${DIRECTORY_KEY_DELIMITER}${key}`;
}

/**
 * @param response - the message from the LLM
 * @returns whether the response includes NAK
 */
export function isNAK(response: string): boolean {
    return response.includes("NAK") && !response.includes("ACK");
}

/**
 * @param response - the message from the LLM
 * @returns whether the response only contains ACK and not NAK
 */
export function isACK(response: string): boolean {
    return response.includes("ACK") && !response.includes("NAK");
}

/**
 * @param originalTemplateStrings - the template strings in the original text
 * @param translatedTemplateStrings - the template strings in the translated text
 * @returns the missing template string from the original
 */
export function getMissingVariables(
    originalTemplateStrings: string[],
    translatedTemplateStrings: string[],
): string[] {
    if (originalTemplateStrings.length === 0) return [];

    const translatedTemplateStringsSet = new Set(translatedTemplateStrings);
    const missingTemplateStrings = originalTemplateStrings.filter(
        (originalTemplateString) =>
            !translatedTemplateStringsSet.has(originalTemplateString),
    );

    return missingTemplateStrings;
}

/**
 * @param templatedStringPrefix - templated String Prefix
 * @param templatedStringSuffix - templated String Suffix
 * @returns the regex needed to get the templated Strings
 */
export function getTemplatedStringRegex(
    templatedStringPrefix: string,
    templatedStringSuffix: string,
): RegExp {
    return new RegExp(
        `${templatedStringPrefix}[^{}]+${templatedStringSuffix}`,
        "g",
    );
}

/**
 * @param startTime - the startTime
 * @param prefix - the prefix of the Execution Time
 */
export function printExecutionTime(startTime: number, prefix?: string): void {
    const endTime = Date.now();
    const roundedSeconds = Math.round((endTime - startTime) / 1000);

    printInfo(`${prefix}${roundedSeconds} seconds\n`);
}

/**
 * @param title - the title
 * @param startTime - the startTime
 * @param totalItems - the totalItems
 * @param processedItems - the processedItems
 */
export function printProgress(
    title: string,
    startTime: number,
    totalItems: number,
    processedItems: number,
): void {
    const roundedEstimatedTimeLeftSeconds = Math.round(
        (((Date.now() - startTime) / (processedItems + 1)) *
            (totalItems - processedItems)) /
        1000,
    );

    const percentage = ((processedItems / totalItems) * 100).toFixed(0);

    process.stdout.write(
        `\r${ansiColors.blueBright(title)} | ${ansiColors.greenBright(`Completed ${percentage}%`)} | ${ansiColors.yellowBright(`ETA: ${roundedEstimatedTimeLeftSeconds}s`)}`,
    );
}

/**
 * @param inputPath - the input path
 * @param outputLanguageCode - the output language code
 * @returns the output path based on the input path and output language code
 */
export function getOutputPathFromInputPath(
    inputPath: string,
    outputLanguageCode: string,
): string {
    const dir = path.dirname(inputPath);
    const filename = `${outputLanguageCode}${path.extname(inputPath)}`;
    return path.join(dir, filename);
}

/**
 * Legacy path-resolution convention: an absolute path resolves as-is,
 * a relative path is tried first under `./jsons/` and then under cwd.
 * @param input - the user-supplied path
 * @returns the resolved absolute path
 */
export function resolveInputPath(input: string): string {
    if (path.isAbsolute(input)) {
        return path.resolve(input);
    }

    const jsonFolder = path.resolve(process.cwd(), "jsons");
    const underJsons = path.resolve(jsonFolder, input);
    if (fs.existsSync(underJsons)) {
        return underJsons;
    }

    return path.resolve(process.cwd(), input);
}

/**
 * For output paths — unlike input paths, the file doesn't exist yet, so
 * we decide based on whether the `./jsons/` directory is present.
 * @param output - the user-supplied output path
 * @returns the resolved absolute path
 */
export function resolveOutputPath(output: string): string {
    if (path.isAbsolute(output)) {
        return path.resolve(output);
    }

    const jsonFolder = path.resolve(process.cwd(), "jsons");
    if (fs.existsSync(jsonFolder)) {
        return path.resolve(jsonFolder, output);
    }

    return path.resolve(process.cwd(), output);
}
