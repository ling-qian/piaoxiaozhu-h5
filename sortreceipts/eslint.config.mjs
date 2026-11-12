import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals"),
  {
    // `.open-next` 与 `.wrangler` 是构建产物：里面是打包后的 worker 与中间件，
    // 拿源码规则去扫会报一堆假错误（Hook 规则、display-name 之类），把真问题淹掉。
    ignores: [".next/**", ".open-next/**", ".wrangler/**", "node_modules/**"],
  },
];

export default eslintConfig;
