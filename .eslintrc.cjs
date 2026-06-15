module.exports = {
  root: true,
  ignorePatterns: ["dist", ".next", "node_modules"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  rules: {
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }]
  },
  overrides: [
    {
      files: ["apps/web/**/*.{ts,tsx}"],
      extends: ["next/core-web-vitals"]
    }
  ]
};
