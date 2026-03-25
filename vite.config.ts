import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  lint: {
    ignorePatterns: ["**/generated/**"],
    options: { typeAware: true, typeCheck: true },
    rules: {
      "unicorn/no-thenable": "off",
    },
  },
});
