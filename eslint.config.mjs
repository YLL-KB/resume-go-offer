import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      ".wrangler/**",
      ".open-next/**",
      "node_modules/**",
      "public/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // React Compiler 专属规则，项目未启用 React Compiler，对
      // useEffect + fetch + setState、latest ref 等标准 React 模式产生大量误报
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
    },
  },
];

export default eslintConfig;
