const reactHooksPlugin = require("eslint-plugin-react-hooks");

module.exports = [
  {
    ignores: ["node_modules/**", ".next/**", "dist/**", ".turbo/**"],
  },
  {
    files: ["**/*.{js,jsx,mjs,cjs}"],
    plugins: {
      "react-hooks": reactHooksPlugin,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",
    },
  },
];
