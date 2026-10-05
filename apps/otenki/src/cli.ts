import { error as styleError } from "./style.ts";

/**
 * Argument parsing and help output. Commander would do this, but the surface
 * area here is six subcommands, five boolean flags and one variadic argument,
 * so a table of commands plus a short parser is the cheaper trade: it keeps the
 * runtime free of dependencies and the behaviour completely legible.
 */

/** `flag` is the long name without the dashes, so `--json` is `{ flag: "json" }`. */
export type Option = {
  flag: string;
  /** Single character short form, rendered and accepted as `-V`. */
  alias?: string;
  description: string;
};

/** A required, repeatable positional argument such as `<location...>`. */
export type Argument = {
  name: string;
  description: string;
};

export type Flags = Record<string, boolean>;

export type Command = {
  name: string;
  description: string;
  /** Omitted for commands that take no positional argument. */
  argument?: Argument;
  options: Option[];
  run: (args: string[], flags: Flags) => Promise<void>;
};

/** A failure the user can fix: bad flag, unknown command, missing argument. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

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

/**
 * Only these two shapes are flags. Requiring a letter keeps negative latitudes
 * (`otenki today -33.86 151.2`) as coordinates rather than as an option bundle,
 * and leaves `--` free for the rare place name that starts with a dash.
 */
const isFlag = (token: string): boolean =>
  /^--[A-Za-z][\w-]*$/.test(token) || /^-[A-Za-z]$/.test(token);

const flagName = (token: string): string =>
  token.startsWith("--") ? token.slice(2) : token.slice(1);

export const parseArgs = (
  argv: readonly string[],
  allowed: readonly string[],
): { flags: Flags; args: string[] } => {
  const flags: Flags = {};
  const args: string[] = [];
  let literal = false;

  for (const token of argv) {
    // `--` matches neither flag shape, so it has to be caught ahead of the test
    // below: everything after it is positional, flag shaped or not.
    if (token === "--") {
      literal = true;
      continue;
    }

    if (literal || !isFlag(token)) {
      args.push(token);
      continue;
    }

    const name = flagName(token);
    if (!allowed.includes(name)) {
      throw new UsageError(`unknown option '${token}'`);
    }

    flags[name] = true;
  }

  return { flags, args };
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

/**
 * Runs one command out of `argv` and returns the exit code. Errors go to stderr
 * the way a CLI should report them: one line, plus the usage when the invocation
 * was at fault. Nothing here calls `process.exit`, so the parser stays testable.
 */
export const dispatch = async (
  commands: readonly Command[],
  argv: readonly string[],
  version: string,
): Promise<number> => {
  const first = argv[0];

  if (first === undefined) {
    console.error(help(commands));
    return 1;
  }

  if (first === "-V" || first === "--version") {
    console.log(version);
    return 0;
  }

  if (first === "-h" || first === "--help" || first === "help") {
    console.log(help(commands));
    return 0;
  }

  const command = commands.find((candidate) => candidate.name === first);

  if (command === undefined) {
    const message = styleError(`✗ unknown command '${first}'`);
    console.error(`${message}\n\n${help(commands)}`);
    return 1;
  }

  const allowed = [
    ...command.options.flatMap((option) =>
      option.alias === undefined ? [option.flag] : [option.flag, option.alias],
    ),
    "help",
    "h",
  ];
  const usage = commandHelp(command);

  try {
    const { flags, args } = parseArgs(argv.slice(1), allowed);

    if (flags.help === true || flags.h === true) {
      console.log(usage);
      return 0;
    }

    if (command.argument !== undefined && args.length === 0) {
      throw new UsageError(
        `missing required argument '${command.argument.name}'`,
      );
    }

    await command.run(args, flags);
    return 0;
  } catch (failure: unknown) {
    const message =
      failure instanceof Error ? failure.message : String(failure);
    // The usage only helps when the invocation was wrong. A failed lookup is
    // the weather's fault, and reprinting the manual on top of it is noise.
    const hint = failure instanceof UsageError ? `\n\n${usage}` : "";

    console.error(`${styleError(`✗ ${message}`)}${hint}`);
    return 1;
  }
};
