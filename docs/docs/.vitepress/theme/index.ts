import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";

import "./custom.css";

/** 既定のテーマに custom.css を重ねるだけ。独自のコンポーネントは増やさない。 */
export default {
  extends: DefaultTheme,
} satisfies Theme;
