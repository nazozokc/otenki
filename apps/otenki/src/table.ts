import { bold, dim } from "./style.ts";
import { displayWidth } from "./width.ts";

/**
 * Column layout for {@link renderTable}. Numbers are right aligned so their
 * decimal points line up down the column, which is the whole reason a table
 * exists; words stay left aligned because trailing space carries no meaning.
 */
export type Column = {
  header: string;
  align?: "left" | "right";
};

/** Two spaces: enough to tell columns apart, too few to shout about. */
const GAP = "  ";

const RULE = "─";

const columnWidths = (columns: Column[], rows: string[][]): number[] =>
  columns.map((column, index) =>
    Math.max(
      displayWidth(column.header),
      ...rows.map((row) => displayWidth(row[index] ?? "")),
    ),
  );

/**
 * Renders a borderless table: a bold header, a rule beneath it, then the rows.
 *
 * Vertical borders and a box around every cell were dropped deliberately. They
 * cost two cells per column and fight the alignment that makes a forecast
 * readable, so the columns are held apart by whitespace alone.
 */
export const renderTable = (columns: Column[], rows: string[][]): string => {
  const widths = columnWidths(columns, rows);

  const line = (cells: string[]): string =>
    columns
      .map((column, index) => {
        const cell = cells[index] ?? "";
        const width = widths[index] ?? 0;
        const pad = " ".repeat(Math.max(0, width - displayWidth(cell)));

        return column.align === "right" ? pad + cell : cell + pad;
      })
      .join(GAP)
      .trimEnd();

  const rule = widths.reduce((total, width) => total + width, 0);
  const header = line(columns.map((column) => bold(column.header)));

  return [
    header,
    dim(RULE.repeat(rule + GAP.length * Math.max(0, columns.length - 1))),
    ...rows.map(line),
  ].join("\n");
};
