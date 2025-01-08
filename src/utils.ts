import ISO6391 from "iso-639-1";
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
            console.error(`err = ${err}`);
        } else {
            console.warn(`err = ${err}`);
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
    outputLanguageCode: string,
): string {
    const outputPath = sourceFilePath.replace(
        `/${inputLanguageCode}/`,
        `/${outputLanguageCode}/`,
    );

    return `${outputPath}:${key}`;
}
