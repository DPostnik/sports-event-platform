import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Layer import rules of AGENTS.md: for each layer, the layers it must not import.
const FORBIDDEN_IMPORTS = {
  domain: ["application", "infrastructure", "http", "config"],
  application: ["infrastructure", "http", "config"],
  infrastructure: ["http", "config"],
  http: ["infrastructure", "config"],
};

// Project files are imported by the full path from the project root:
// "#src/..." or "#test/...". The "imports" field of package.json maps the two
// prefixes to the folders, and Node.js, TypeScript and Vitest all read it.
const NO_RELATIVE_IMPORTS = {
  regex: "^\\.",
  message: "Import project files as #src/... or #test/..., not by a relative path.",
};

const layerRule = (layer, forbidden) => ({
  files: [`src/${layer}/**/*.ts`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          NO_RELATIVE_IMPORTS,
          ...forbidden.map((other) => ({
            regex: `^#src/${other}/`,
            message: `${layer} must not import from ${other} (AGENTS.md layer rules).`,
          })),
          { regex: "^#src/main\\.ts$", message: `${layer} must not import the composition root.` },
          // The domain imports only its own files: no packages and no Node built-ins.
          ...(layer === "domain"
            ? [{ regex: "^(?!#src/domain/)", message: "domain imports only domain files." }]
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
  { rules: { "no-restricted-imports": ["error", { patterns: [NO_RELATIVE_IMPORTS] }] } },
  ...Object.entries(FORBIDDEN_IMPORTS).map(([layer, forbidden]) => layerRule(layer, forbidden)),
);
