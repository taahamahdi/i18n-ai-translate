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
 * @param filename - the filename to get the language from
 * @returns the language code from the filename
 */
export function getLanguageCodeFromFilename(filename: string): string {
    const splitFilename = filename.split("/");
    const lastPart = splitFilename[splitFilename.length - 1];
    const splitLastPart = lastPart.split(".");
    return splitLastPart[0];
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
    const outputPath = sourceFilePath.replace(
        `/${inputLanguageCode}/`,
        `/${outputLanguageCode ?? inputLanguageCode}/`,
    );

    return `${outputPath}:${key}`;
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
