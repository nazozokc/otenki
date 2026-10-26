//! Borderless table rendering, the mirror of `table.ts`. A bold header, a
//! rule beneath it, then the rows — held apart by whitespace alone. Vertical
//! borders and a box around every cell cost two cells per column and fight
//! the alignment that makes a forecast readable, so they don't exist here.

use crate::style::{bold, dim};
use crate::width::display_width;

/// Column layout for [`render_table`]. Numbers are right aligned so their
/// decimal points line up down the column, which is the whole reason a table
/// exists; words stay left aligned because trailing space carries no meaning.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Align {
    Left,
    Right,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Column {
    pub header: String,
    pub align: Option<Align>,
}

impl Column {
    pub fn new(header: &str, align: Option<Align>) -> Self {
        Column {
            header: header.to_string(),
            align,
        }
    }
}

/// Two spaces: enough to tell columns apart, too few to shout about.
const GAP: &str = "  ";

const RULE: &str = "─";

/// `trimEnd` in its JS form: trailing whitespace by code point.
fn trim_end(text: &str) -> &str {
    text.trim_matches(|c: char| {
        matches!(
            u32::from(c),
            0x0009 | 0x000A..=0x000D | 0x0020 | 0x0085 | 0x00A0 | 0x1680
                | 0x2000..=0x200A | 0x2028 | 0x2029 | 0x202F | 0x205F | 0x3000 | 0xFEFF
        )
    })
}

fn column_widths(columns: &[Column], rows: &[Vec<String>]) -> Vec<usize> {
    columns
        .iter()
        .enumerate()
        .map(|(index, column)| {
            let mut width = display_width(&column.header);
            for row in rows {
                let cell = row.get(index).map(String::as_str).unwrap_or("");
                width = width.max(display_width(cell));
            }
            width
        })
        .collect()
}

/// Renders a borderless table. Cells fall back to `""` when a row is shorter
/// than the table is wide, exactly like `cells[index] ?? ""`.
pub fn render_table(columns: &[Column], rows: &[Vec<String>]) -> String {
    let widths = column_widths(columns, rows);

    let line = |cells: &[String]| -> String {
        columns
            .iter()
            .enumerate()
            .map(|(index, column)| {
                let cell = cells.get(index).map(String::as_str).unwrap_or("");
                let width = widths.get(index).copied().unwrap_or(0);
                let pad = " ".repeat(width.saturating_sub(display_width(cell)));

                match column.align {
                    Some(Align::Right) => format!("{pad}{cell}"),
                    _ => format!("{cell}{pad}"),
                }
            })
            .collect::<Vec<_>>()
            .join(GAP)
    };

    let rule_width: usize = widths.iter().sum();
    let header = line(
        &columns
            .iter()
            .map(|column| bold(&column.header))
            .collect::<Vec<_>>(),
    );

    let mut lines = vec![
        header,
        dim(&RULE.repeat(rule_width + GAP.len() * columns.len().saturating_sub(1))),
    ];
    for row in rows {
        lines.push(line(row));
    }
    lines
        .iter()
        .map(|l| trim_end(l))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ColorMode;
    use crate::style::set_color_mode;

    fn row(cells: &[&str]) -> Vec<String> {
        cells.iter().map(|c| c.to_string()).collect()
    }

    #[test]
    fn numbers_line_up_and_the_rule_spans_the_gap() {
        // Paint the escape codes exactly as a TTY run would see them.
        set_color_mode(Some(ColorMode::Always));
        let columns = [
            Column::new("日付", None),
            Column::new("気温", Some(Align::Right)),
        ];
        let rows = [
            row(&["10-05 (月)", "9.5℃"]),
            row(&["10-06 (火)", "13.0℃"]),
            row(&["10-07 (水)", "-"]),
        ];
        let table = render_table(&columns, &rows);
        let lines: Vec<&str> = table.split('\n').collect();
        assert_eq!(lines.len(), 5); // header + rule + three rows
                                    // Header: 日付 (4 cells) padded to 10, gap 2, then 気温 right-padded
                                    // to 6 (bold codes are invisible to width, so they never break this).
        assert_eq!(
            lines[0].trim_end(),
            format!(
                "\u{1B}[1m日付\u{1B}[0m{}  \u{1B}[1m気温\u{1B}[0m",
                " ".repeat(8)
            )
        );
        // Rule: 10 + gap 2 + 6 = 18 dashes.
        assert_eq!(lines[1].trim_end(), "\u{1B}[90m──────────────────\u{1B}[0m");
        // Right alignment pads in front: each row line ends on its value.
        assert!(lines[2].trim_end().ends_with("9.5℃"));
        assert!(lines[3].trim_end().ends_with("13.0℃"));
        // The last row is the "-" cell, padded in front to the 6-cell column.
        assert_eq!(lines[4], "10-07 (水)       -");
        set_color_mode(None);
    }

    #[test]
    fn colour_inside_cells_does_not_break_padding() {
        set_color_mode(Some(ColorMode::Always));
        let columns = [Column::new("雨", None)];
        let rows = [row(&["\u{1B}[36m40%\u{1B}[0m"]), row(&["-"])];
        let table = render_table(&columns, &rows);
        assert!(table.contains("40%"));
        // The column is as wide as 40% (3 cells) — width after SGR stripping —
        // while "-" is a line whose trailing pad gets trimmed at the end of
        // every rendered row.
        let lines: Vec<&str> = table.split('\n').collect();
        assert_eq!(lines[0].trim_end(), "\u{1B}[1m雨\u{1B}[0m");
        assert_eq!(lines[1].trim_end(), "\u{1B}[90m───\u{1B}[0m");
        assert_eq!(lines[2], "\u{1B}[36m40%\u{1B}[0m");
        assert_eq!(lines[3], "-");
        set_color_mode(None);
    }

    #[test]
    fn single_column_tables_have_no_gap() {
        set_color_mode(Some(ColorMode::Always));
        let columns = [Column::new("only", None)];
        let table = render_table(&columns, &[row(&["a"])]);
        let lines: Vec<&str> = table.split('\n').collect();
        assert_eq!(lines[0].trim_end(), "\u{1B}[1monly\u{1B}[0m");
        assert_eq!(lines[1].trim_end(), "\u{1B}[90m────\u{1B}[0m");
        assert_eq!(lines[2], "a");
        set_color_mode(None);
    }
}
