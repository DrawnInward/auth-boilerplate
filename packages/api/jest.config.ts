module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/__tests__"],
  setupFiles: ["<rootDir>/jest.env.ts"],
  // Suffix-matched rather than "anything under __tests__", so shared helpers can
  // live in __tests__/helpers/ without jest treating them as empty test suites.
  testMatch: ["**/*.(test|spec).+(ts|tsx|js)"],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "!src/**/*.d.ts"],
};
