module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    roots: ["<rootDir>/src/test"],
    setupFiles: ["<rootDir>/src/test/jest.setup.ts"],
    collectCoverage: true,
};
