export default {
  testEnvironment: 'node',
  preset: 'ts-jest/presets/default-esm',
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/*.test.js'
  ],
  collectCoverageFrom: [
    '*.js',
    '!jest.config.js',
    '!coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.js$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        allowJs: true
      }
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
}