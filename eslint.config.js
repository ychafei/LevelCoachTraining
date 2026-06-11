import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginUnusedImports from "eslint-plugin-unused-imports";

const reactRules = {
  ...pluginReact.configs.flat.recommended.rules,
  "react/jsx-uses-vars": "error",
  "react/prop-types": "off",
  "react/react-in-jsx-scope": "off",
  "react/no-unescaped-entities": "off",
  "react/display-name": "off",
  "react/no-unknown-property": [
    "error",
    { ignore: ["cmdk-input-wrapper", "toast-close"] },
  ],
};

const unusedRules = {
  "no-unused-vars": "off",
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": [
    "warn",
    {
      vars: "all",
      varsIgnorePattern: "^_",
      args: "after-used",
      argsIgnorePattern: "^_",
    },
  ],
};

export default [
  { ignores: ["dist/**", "node_modules/**"] },

  // Browser app — full coverage (components, pages, features, lib, api, hooks).
  {
    files: ["src/**/*.{js,jsx}"],
    ...pluginJs.configs.recommended,
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: "detect" } },
    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "unused-imports": pluginUnusedImports,
    },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...reactRules,
      ...unusedRules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  // Node code — Appwrite Functions and ops scripts.
  {
    files: ["functions/**/*.js", "scripts/**/*.mjs"],
    ...pluginJs.configs.recommended,
    languageOptions: {
      globals: globals.node,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
    },
    plugins: { "unused-imports": pluginUnusedImports },
    rules: {
      ...pluginJs.configs.recommended.rules,
      ...unusedRules,
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // React Three Fiber renders three.js primitives as JSX — eslint's DOM
    // property check doesn't know that vocabulary.
    files: ["src/features/marketing/HeroAscent.jsx"],
    rules: { "react/no-unknown-property": "off" },
  },
];
