import type { Command, Option } from "./cli.parse.ts";
import { bold } from "./style.ts";

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

const noConfigOption: Option = {
  flag: "no-config",
  description: "ignore the config file",
};

/** Where the config file lives, for the line under the root help. */
const CONFIG_PATH = "$XDG_CONFIG_HOME/otenki/config.json";

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
    bold(`${title}:`),
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
    bold(`Usage: ${usage} [options]`),
    "",
    `  ${command.description}`,
    ...arguments_,
    ...section(
      "Options",
      // The global options are listed per command because the parser accepts
      // them there as well: `otenki today 横浜 --version` has to work.
      // `--no-config` is stripped before the parser, so it too is accepted
      // anywhere in the arguments.
      [...command.options, versionOption, helpOption, noConfigOption].map(
        (option) => [optionLabel(option), option.description],
      ),
    ),
  ].join("\n");
};

export const help = (commands: readonly Command[]): string =>
  [
    bold(`Usage: ${PROGRAM} <command> [options]`),
    "",
    `  ${SUMMARY}`,
    ...section(
      "Commands",
      commands.map((command) => [command.name, command.description]),
    ),
    ...section(
      "Options",
      [versionOption, helpOption, noConfigOption].map((option) => [
        optionLabel(option),
        option.description,
      ]),
    ),
    "",
    `Set a default location, command and units in \`${CONFIG_PATH}\`.`,
    `Run \`${PROGRAM} <command> --help\` for the options of a single command.`,
  ].join("\n");
