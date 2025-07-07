import type * as utils from "../utils";
import type TranslateOptions from "../interfaces/translate_options";

process.env.OPENAI_API_KEY = "test";

jest.mock("openai", () => function OpenAIMock() {});
jest.mock("../chats/chat_factory", () => ({
    __esModule: true,
    default: { newChat: jest.fn(() => ({ startChat: jest.fn() })) },
}));

const fr = (value: string): string => `${value}_fr`;
const es = (value: string): string => `${value}_es`;

jest.mock("../generate_json/generate", () => ({
    __esModule: true,
    default: class GenerateTranslationJSON {
        translateJSON(
            flat: Record<string, string>,
            options: TranslateOptions,
        ): Object {
            const translateFn = options.outputLanguage === "fr" ? fr : es;
            return Object.fromEntries(
                Object.entries(flat).map(([k, v]) => [
                    k,
                    translateFn(v as string),
                ]),
            );
        }
    },
}));

jest.mock("../generate_csv/generate", () => ({
    __esModule: true,
    default: (flat: Record<string, string>, options: TranslateOptions) => {
        const translateFn = options.outputLanguage === "fr" ? fr : es;
        return Object.fromEntries(
            Object.entries(flat).map(([k, v]) => [k, translateFn(v as string)]),
        );
    },
}));

jest.mock("../utils", () => {
    // Pull in the real module once so we can reuse its exports.
    const actualUtils = jest.requireActual<typeof utils>("../utils");

    return {
        ...actualUtils,
        delay: jest.fn(() => Promise.resolve()),
        printExecutionTime: jest.fn(),
        printInfo: jest.fn(),
    };
});
