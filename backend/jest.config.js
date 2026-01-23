/**
 * Jest configuration for RealTranslate backend tests
 */

export default {
  // Use Node test environment
  testEnvironment: 'node',

  // Support ES modules (transform: {} disables transform)
  transform: {},

  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js'
  ],

  // Coverage configuration
  collectCoverageFrom: [
    '**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!jest.config.js',
    '!migrate-to-sqlite.js'
  ],

  // Verbose output
  verbose: true,

  // Timeout for tests (WebSocket tests might take longer)
  testTimeout: 10000,

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js']
};
