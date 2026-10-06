import type { Command, Option } from "./cli.parse.ts";

/** Help text rendering: pure string building, no I/O and no parsing. */

const PROGRAM = "otenki";

const SUMMARY = "view weather for any place on earth";

const versionOption: Option = {
  flag: "version",
  alias: "V",
  description: "print the version",
};

const helpOption: Option = {
  flag: "help",
  alias: "h",
  description: "show this help",
};

const optionLabel = (option: Option): string =>
  option.alias === undefined
    ? `--${option.flag}`
    : `-${option.alias}, --${option.flag}`;

/** Two columns with the descriptions lined up under each other. */
const section = (title: string, rows: Array<[string, string]>): string[] => {
  if (rows.length === 0) return [];

  const width = Math.max(...rows.map(([left]) => left.length));

  return [
    "",
    `${title}:`,
    ...rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`),
  ];
};

export const commandHelp = (command: Command): string => {
  const usage =
    command.argument === undefined
      ? `${PROGRAM} ${command.name}`
      : `${PROGRAM} ${command.name} <${command.argument.name}...>`;

  const arguments_ =
    command.argument === undefined
      ? []
      : section("Arguments", [
          [command.argument.name, command.argument.description],
        ]);

  return [
    `Usage: ${usage} [options]`,
    "",
    `  ${command.description}`,
    ...arguments_,
    ...section(
      "Options",
      [...command.options, helpOption].map((option) => [
        optionLabel(option),
        option.description,
      ]),
    ),
  ].join("\n");
};

export const help = (commands: readonly Command[]): string =>
  [
    `Usage: ${PROGRAM} <command> [options]`,
    "",
    `  ${SUMMARY}`,
    ...section(
      "Commands",
      commands.map((command) => [command.name, command.description]),
    ),
    ...section(
      "Options",
      [versionOption, helpOption].map((option) => [
        optionLabel(option),
        option.description,
      ]),
    ),
    "",
    `Run \`${PROGRAM} <command> --help\` for the options of a single command.`,
  ].join("\n");
