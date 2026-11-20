import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Layer import rules of AGENTS.md: for each layer, the layers it must not import.
const FORBIDDEN_IMPORTS = {
  domain: ["application", "infrastructure", "http", "config"],
  application: ["infrastructure", "http", "config"],
  infrastructure: ["http", "config"],
  http: ["infrastructure", "config"],
};

// Patterns match relative paths, so they work without path aliases.
const layerRule = (layer, forbidden) => ({
  files: [`src/${layer}/**/*.ts`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          ...forbidden.map((other) => ({
            group: [`**/${other}`, `**/${other}/**`],
            message: `${layer} must not import from ${other} (AGENTS.md layer rules).`,
          })),
          { group: ["**/main", "**/main.*"], message: `${layer} must not import the composition root.` },
          // The domain imports only its own files: no packages and no Node built-ins.
          ...(layer === "domain"
            ? [{ regex: "^[^.]", message: "domain imports only relative domain files." }]
            : []),
        ],
      },
    ],
  },
});

export default tseslint.config(
  { ignores: ["node_modules/", "brief/", "notes/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Not in the strict preset. A union case missed in a switch becomes a lint error.
      "@typescript-eslint/switch-exhaustiveness-check": "error",
    },
  },
  { files: ["**/*.js"], ...tseslint.configs.disableTypeChecked },
  ...Object.entries(FORBIDDEN_IMPORTS).map(([layer, forbidden]) => layerRule(layer, forbidden)),
);
