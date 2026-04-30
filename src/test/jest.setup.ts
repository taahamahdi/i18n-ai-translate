import type * as utils from "../utils";
import type TranslationContext from "../interfaces/translation_context";

process.env.OPENAI_API_KEY = "test";

jest.mock("openai", () => function OpenAIMock() {});
jest.mock("../chats/chat_factory", () => ({
    __esModule: true,
    default: { newChat: jest.fn(() => ({ startChat: jest.fn() })) },
}));

const fr = (value: string): string => `${value}_fr`;
const es = (value: string): string => `${value}_es`;

function fakeTranslateCtx(ctx: TranslationContext): Object {
    const translateFn =
        ctx.options.outputLanguageCode === "fr" ? fr : es;
    return Object.fromEntries(
        Object.entries(ctx.flatInput).map(([k, v]) => [
            k,
            translateFn(v as string),
        ]),
    );
}

jest.mock("../generate_json/generate", () => ({
    __esModule: true,
    default: class GenerateTranslationJSON {
        translateJSON(ctx: TranslationContext): Object {
            return fakeTranslateCtx(ctx);
        }
    },
}));

jest.mock("../generate_csv/generate", () => ({
    __esModule: true,
    default: (ctx: TranslationContext) => fakeTranslateCtx(ctx),
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
