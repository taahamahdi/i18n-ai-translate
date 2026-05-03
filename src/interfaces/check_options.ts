import type Options from "./options";

export default interface CheckOptions extends Options {
    inputLanguageCode: string;
    outputLanguageCode: string;
    inputJSON: Object;
    targetJSON: Object;
}

export type CheckIssue = {
    key: string;
    original: string;
    translated: string;
    issue: string;
    suggestion?: string;
};

export type CheckReport = {
    languageCode: string;
    totalKeys: number;
    issues: CheckIssue[];
};
