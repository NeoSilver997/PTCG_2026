/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  // rootDir = src so Jest never scans the dist/ compiled output
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: '<rootDir>/../tsconfig.json',
    }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    // rootDir = apps/api/src → go up 3 levels to workspace root
    '^@ptcg/database$': '<rootDir>/../../../packages/database/node_modules/.prisma/client',
    '^@ptcg/shared-types$': '<rootDir>/../../../packages/shared-types/src',
  },
};
