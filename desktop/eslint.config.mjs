import react from "eslint-plugin-react";
import globals from "globals";
export default [{ files: ["src/**/*.{js,jsx}"], plugins: { react },
  languageOptions: { ecmaVersion: 2022, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } }, globals: { ...globals.browser } },
  rules: { "no-undef": "error", "react/jsx-no-undef": "error", "react/jsx-uses-vars": "error", "no-unused-vars": "off" } }];
