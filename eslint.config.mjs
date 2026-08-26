import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/.wrangler/**",
      "**/.open-next/**",
      "**/public/**",
      "**/.db/**",
      "**/drizzle/**",
      "**/dist/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // 允许 `_` 前缀表示「故意未使用」的参数/变量（如 LangGraph 节点签名、预留 API 参数）
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["packages/ui/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // React Compiler 专属规则，项目未启用 React Compiler，对齐 web/admin 关闭
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
);
