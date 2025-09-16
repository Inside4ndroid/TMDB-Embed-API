module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  ignorePatterns: ["public/*"],
  extends: [
    'eslint:recommended'
  ],
  rules: {
    'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
    'no-undef': 'error',
    'no-console': 'off',
    'prefer-const': 'warn',
    'eqeqeq': ['warn', 'smart'],
    'no-var': 'warn'
  }
};
