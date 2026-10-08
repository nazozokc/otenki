import { describe, expect, test } from "bun:test";
import { wet } from "../src/style.ts";
import { type Column, renderTable } from "../src/table.ts";
import { displayWidth } from "../src/width.ts";
import { plain, withColor } from "./support.ts";

describe("displayWidth", () => {
  test("counts latin characters as one cell each", () => {
    expect(displayWidth("")).toBe(0);
    expect(displayWidth("17.5")).toBe(4);
    expect(displayWidth("17.5℃ ~ 21.1℃")).toBe(15);
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
    expect(displayWidth("\u001B[33m13.8℃\u001B[0m")).toBe(6);
    expect(displayWidth("\u001B[90m-\u001B[0m")).toBe(1);
  });
});

describe("renderTable", () => {
  const columns = [
    { header: "date" },
    { header: "temp", align: "right" as const },
  ];

  const rows = [
    ["10-05 (月)", "17.5℃ ~ 21.1℃"],
    ["10-06 (火)", "20.2℃ ~ 26.7℃"],
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
      "10-05 (月)  17.5℃ ~ 21.1℃",
      "10-06 (火)  20.2℃ ~ 26.7℃",
    ]);
  });

  test("right aligns numbers and left aligns words", () => {
    const wide = plain(() =>
      renderTable(columns, [
        ["10-05 (月)", "9.9℃"],
        ["10-06 (火)", "17.5℃ ~ 21.1℃"],
      ]).split("\n"),
    );

    // Both temperature cells end on the same column, so the short one is padded
    // on the left rather than the right. Measured in cells: ℃ is one code point
    // but two columns, so a character index would miss the alignment by one.
    const short = wide[2] ?? "";
    const long = wide[3] ?? "";
    const within = (line: string, cell: string): number =>
      displayWidth(line.slice(0, line.indexOf(cell) + cell.length));

    expect(short.endsWith("9.9℃")).toBe(true);
    expect(long.endsWith("17.5℃ ~ 21.1℃")).toBe(true);
    expect(within(short, "9.9℃")).toBe(within(long, "17.5℃ ~ 21.1℃"));
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

  test("lays Japanese headers and emoji cells out on one grid", () => {
    const japanese: Column[] = [
      { header: "日付" },
      { header: "天気" },
      { header: "最低", align: "right" },
    ];
    const lines = plain(() =>
      renderTable(japanese, [
        ["10-07 (水)", "☀️ 快晴", "13.3℃"],
        ["10-10 (土)", "🌤️ 晴れ時々くもり", "11.3℃"],
      ]).split("\n"),
    );

    const width = displayWidth(lines[0] ?? "");
    for (const line of lines) expect(displayWidth(line)).toBe(width);
  });

  test("pads a coloured cell against its visible width", () => {
    // The escape sequences are longer than the cell itself, so a renderer that
    // padded by string length would leave this row short of the rule. Both
    // columns are right aligned because a trailing pad is trimmed away: only a
    // leading one can show a cell that measured short.
    const wetColumns: Column[] = [
      { header: "降水", align: "right" },
      { header: "備考", align: "right" },
    ];
    const lines = withColor(true, () =>
      renderTable(wetColumns, [
        ["123.4 mm", "0.0"],
        [wet("9.0 mm"), "1.0"],
      ]).split("\n"),
    );

    const width = displayWidth(lines[0] ?? "");
    for (const line of lines) expect(displayWidth(line)).toBe(width);
  });
});
