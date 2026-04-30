import type * as utils from "../utils";

process.env.OPENAI_API_KEY = "test";

jest.mock("openai", () => function OpenAIMock() {});
jest.mock("../chats/chat_factory", () => ({
    __esModule: true,
    default: { newChat: jest.fn(() => ({ startChat: jest.fn() })) },
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
