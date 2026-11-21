import type { Command, Option } from "./cli.parse.ts";
import { bold } from "./style.ts";
import { displayWidth } from "./width.ts";

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

/**
 * Two columns with the descriptions lined up under each other. Measured in
 * terminal cells, not characters: a Japanese place name is two cells wide and
 * `padEnd` would shift every description in the section by one.
 */
const section = (title: string, rows: Array<[string, string]>): string[] => {
  if (rows.length === 0) return [];

  const width = Math.max(...rows.map(([left]) => displayWidth(left)));

  return [
    "",
    bold(`${title}:`),
    ...rows.map(
      ([left, right]) =>
        `  ${left}${" ".repeat(Math.max(0, width - displayWidth(left)))}  ${right}`,
    ),
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
    ...section("Examples", [
      ["otenki today 函館", "current weather in one place"],
      ["otenki weekly 東京", "seven day forecast table"],
      ["otenki locate 横浜 --all", "every place that matches the name"],
    ]),
    "",
    `Set a default location, command and units in \`${CONFIG_PATH}\`.`,
    `Run \`${PROGRAM} <command> --help\` for the options of a single command.`,
  ].join("\n");
