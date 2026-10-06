import { describe, expect, test } from "bun:test";
import { sanitizeText } from "../src/sanitize.ts";

describe("sanitizeText", () => {
  test("leaves ordinary text untouched", () => {
    expect(sanitizeText("函館市 北海道 41.77583")).toBe(
      "函館市 北海道 41.77583",
    );
  });

  test("strips CSI colour sequences without leaving the parameters", () => {
    expect(sanitizeText("\u001B[31m赤い\u001B[0m")).toBe("赤い");
    expect(sanitizeText("\u001B[1;38;5;208m.bold\u001B[m")).toBe(".bold");
  });

  test("strips OSC sequences such as clipboard writes", () => {
    // OSC 52: ESC ] 52 ; c ; <base64> BEL — the classic clipboard hijack.
    expect(sanitizeText("\u001B]52;c;YWJj\u0007函館")).toBe("函館");
    // ST-terminated form (ESC \) as well.
    expect(sanitizeText("\u001B]0;title\u001B\\横浜")).toBe("横浜");
  });

  test("removes newlines and tabs so a field stays one line", () => {
    expect(sanitizeText("横浜\n市\t区")).toBe("横浜市区");
  });

  test("removes DEL and the C1 control block", () => {
    expect(sanitizeText("a\u007Fb\u0085c\u009Bd")).toBe("abcd");
  });

  test("disarms a two-character escape", () => {
    expect(sanitizeText("\u001B7保存\u001B8")).toBe("保存");
  });

  test("keeps CJK, kana and emoji intact", () => {
    expect(sanitizeText("函館🌨🧖‍♀️")).toBe("函館🌨🧖‍♀️");
  });
});
