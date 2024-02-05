import { Code, by639_1 as languageCodes } from "iso-language-codes";

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

export function getLanguageFromFilename(filename: string): Code | null {
    if (filename.includes(".")) {
        const languageCode = filename.split(".")[0];
        if (languageCodes[languageCode as keyof typeof languageCodes]) {
            return languageCodes[languageCode as keyof typeof languageCodes];
        }
    }

    return null;
}

export function getLanguageFromCode(code: string): Code | null {
    if (languageCodes[code as keyof typeof languageCodes]) {
        return languageCodes[code as keyof typeof languageCodes];
    }

    return null;
}

export function getAllLanguageCodes(): string[] {
    return Object.keys(languageCodes);
}
