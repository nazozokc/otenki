import { describe, expect, test } from "bun:test";
import { styled } from "../src/style.ts";
import { renderTable } from "../src/table.ts";
import { displayWidth } from "../src/width.ts";

/**
 * `style.ts` reads `NO_COLOR` and `process.stdout.isTTY` on every call, so these
 * tests pin both rather than inherit them. `bun test` runs with a terminal on it
 * in some sandboxes and without in others, which is enough to turn the layout
 * assertions below into escape-sequence soup.
 */
const withColor = <T>(color: boolean, run: () => T): T => {
  const stdout = process.stdout as { isTTY?: boolean };
  const wasTty = Object.getOwnPropertyDescriptor(stdout, "isTTY");
  const hadNoColor = process.env.NO_COLOR;

  Object.defineProperty(stdout, "isTTY", { value: color, configurable: true });
  if (color) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = "1";

  try {
    const result = run();
    // Guards the helper itself: without this, a `styled()` that never sees the
    // override would let the assertions below pass for the wrong reason.
    expect(styled()).toBe(color);
    return result;
  } finally {
    if (wasTty === undefined) delete stdout.isTTY;
    else Object.defineProperty(stdout, "isTTY", wasTty);

    if (hadNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = hadNoColor;
  }
};

const plain = <T>(run: () => T): T => withColor(false, run);

describe("displayWidth", () => {
  test("counts latin characters as one cell each", () => {
    expect(displayWidth("")).toBe(0);
    expect(displayWidth("17.5")).toBe(4);
    expect(displayWidth("17.5°C ~ 21.1°C")).toBe(15);
  });

  test("counts Japanese as two cells each", () => {
    expect(displayWidth("曇り")).toBe(4);
    expect(displayWidth("部分的に曇り")).toBe(12);
    expect(displayWidth("横浜市 神奈川県")).toBe(15);
  });

  test("counts emoji as two cells even when a variation selector follows", () => {
    // ☀ is a narrow symbol on its own; the terminal draws the pair two wide.
    expect(displayWidth("☀️")).toBe(2);
    expect(displayWidth("☁️")).toBe(2);
    expect(displayWidth("🌤️")).toBe(2);
    expect(displayWidth("⛈️")).toBe(2);
    expect(displayWidth("❓")).toBe(2);
  });

  test("counts a joined emoji sequence as the single glyph it renders", () => {
    expect(displayWidth("👨‍👩‍👧")).toBe(2);
  });

  test("ignores colour so a styled cell measures like a plain one", () => {
    expect(displayWidth("\u001B[33m13.8°C\u001B[0m")).toBe(6);
    expect(displayWidth("\u001B[90m-\u001B[0m")).toBe(1);
  });
});

describe("renderTable", () => {
  const columns = [
    { header: "date" },
    { header: "temp", align: "right" as const },
  ];

  const rows = [
    ["10-05 (月)", "17.5°C ~ 21.1°C"],
    ["10-06 (火)", "20.2°C ~ 26.7°C"],
  ];

  test("lines every row up to the same width", () => {
    const lines = plain(() => renderTable(columns, rows).split("\n"));

    expect(lines).toHaveLength(4);
    for (const line of lines) {
      expect(displayWidth(line)).toBe(displayWidth(lines[0] ?? ""));
    }
  });

  test("puts a header, a rule and then the rows", () => {
    const [header, rule, ...rest] = plain(() =>
      renderTable(columns, rows).split("\n"),
    );

    expect(header).toBe("date                   temp");
    expect(rule).toBe("─".repeat(displayWidth(header ?? "")));
    expect(rest).toEqual([
      "10-05 (月)  17.5°C ~ 21.1°C",
      "10-06 (火)  20.2°C ~ 26.7°C",
    ]);
  });

  test("right aligns numbers and left aligns words", () => {
    const wide = plain(() =>
      renderTable(columns, [
        ["10-05 (月)", "9.9°C"],
        ["10-06 (火)", "17.5°C ~ 21.1°C"],
      ]).split("\n"),
    );

    // Both temperature cells end on the same column, so the short one is padded
    // on the left rather than the right.
    const short = wide[2] ?? "";
    const long = wide[3] ?? "";

    expect(short.endsWith("9.9°C")).toBe(true);
    expect(long.endsWith("17.5°C ~ 21.1°C")).toBe(true);
    expect(short.indexOf("9.9°C") + 5).toBe(long.indexOf("17.5°C") + 15);
  });

  test("never leaves trailing whitespace", () => {
    for (const line of plain(() => renderTable(columns, rows).split("\n"))) {
      expect(line).toBe(line.trimEnd());
    }
  });

  test("renders a header on its own for an empty result set", () => {
    const lines = plain(() => renderTable(columns, []).split("\n"));

    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("─".repeat(displayWidth(lines[0] ?? "")));
  });

  test("measures a column by its widest cell, not its header", () => {
    const lines = plain(() =>
      renderTable([{ header: "x" }], [["長い日本語の名前"]]).split("\n"),
    );

    expect(lines[1]).toBe("─".repeat(16));
  });

  test("bolds the header and dims the rule once colour is on", () => {
    const lines = withColor(true, () => renderTable(columns, rows).split("\n"));

    expect(lines[0]?.startsWith("\u001B[1m")).toBe(true);
    expect(lines[1]?.startsWith("\u001B[90m")).toBe(true);
    // Padding follows the visible width, so the escapes cost no columns.
    const plainHeader = plain(() => renderTable(columns, rows).split("\n")[0]);
    expect(displayWidth(lines[0] ?? "")).toBe(displayWidth(plainHeader ?? ""));
  });

  test("NO_COLOR wins over a terminal", () => {
    const lines = withColor(false, () =>
      renderTable(columns, rows).split("\n"),
    );

    expect(lines[0]).toBe("date                   temp");
  });
});
