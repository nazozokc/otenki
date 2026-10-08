import { commandHelp, help } from "./cli.help.ts";
import { type Command, isFlag, parseArgs, UsageError } from "./cli.parse.ts";
import type { Config } from "./config.ts";
import { sanitizeText } from "./sanitize.ts";
import { error as styleError } from "./style.ts";

/**
 * Runs one command out of `argv` and returns the exit code. Errors go to stderr
 * the way a CLI should report them: one line, plus the usage when the invocation
 * was at fault. Nothing here calls `process.exit`, so the parser stays testable.
 *
 * `config` supplies the two defaults the config file is allowed to set at the
 * argument level: a command for a bare invocation, and a location for an
 * omitted one. Both are what the CLI would have gotten anyway, so an explicit
 * argument always wins without the two sides having to negotiate.
 */
export const dispatch = async (
  commands: readonly Command[],
  argv: readonly string[],
  version: string,
  config: Config = {},
): Promise<number> => {
  const first = argv[0];

  if (first === undefined && config.command === undefined) {
    console.error(help(commands));
    return 1;
  }

  if (first === "-V" || first === "--version") {
    console.log(version);
    return 0;
  }

  const failUnknown = (name: string): number => {
    // The name is argv: strip control sequences before it reaches the terminal.
    const message = styleError(`✗ unknown command '${sanitizeText(name)}'`);
    console.error(`${message}\n\n${help(commands)}`);
    return 1;
  };

  // `-h` and friends win over the configured command: a reader who asks for
  // help is not asking for the weather, configured or not.
  if (first === "-h" || first === "--help" || first === "help") {
    // `help <command>` and `--help <command>` name the command in the next
    // token; without one, both print the root help.
    const target = argv[1];

    if (target === undefined) {
      console.log(help(commands));
      return 0;
    }

    const named = commands.find((candidate) => candidate.name === target);
    if (named === undefined) return failUnknown(target);

    console.log(commandHelp(named));
    return 0;
  }

  let tokens = argv;

  // The configured command stands in for a missing command name: a bare
  // invocation, or one that starts with an option meant for that command
  // (`otenki --json` is `otenki weekly --json` when weekly is configured).
  // An explicit command name skips this, which is the precedence rule.
  if (config.command !== undefined && (first === undefined || isFlag(first))) {
    const configured = commands.find(
      (candidate) => candidate.name === config.command,
    );

    if (configured === undefined) {
      // The config file is user input, and a typo there should say so rather
      // than fall through as an unknown command with no path to the cause.
      const message = styleError(
        `✗ config: unknown command '${sanitizeText(config.command)}'`,
      );
      console.error(`${message}\n\n${help(commands)}`);
      return 1;
    }

    tokens = [configured.name, ...argv];
  }

  const head = tokens[0];

  if (head === undefined) {
    // Unreachable: the branches above either return or prepend a token.
    console.error(help(commands));
    return 1;
  }

  // The token is shaped like an option, so calling it an unknown command would
  // send the reader looking in the wrong list. The mistake is its position.
  if (isFlag(head)) {
    const message = styleError(
      `✗ option '${sanitizeText(head)}' must come after the command`,
    );
    console.error(`${message}\n\n${help(commands)}`);
    return 1;
  }

  const command = commands.find((candidate) => candidate.name === head);

  if (command === undefined) {
    return failUnknown(head);
  }

  const allowed = [
    ...command.options.flatMap((option) =>
      option.alias === undefined ? [option.flag] : [option.flag, option.alias],
    ),
    "help",
    "h",
    // Both are global options, but the command token comes first in
    // `otenki today 横浜 --version`, so they are only reachable if the
    // per-command parser is told about them too.
    "version",
    "V",
  ];
  const usage = commandHelp(command);

  try {
    const { flags, args: parsedArgs } = parseArgs(tokens.slice(1), allowed);
    let args = parsedArgs;

    if (flags.help === true || flags.h === true) {
      console.log(usage);
      return 0;
    }

    if (flags.version === true || flags.V === true) {
      console.log(version);
      return 0;
    }

    // The configured location only fills the gap: one argument on the command
    // line means the reader said which place, so the default stays home.
    if (command.argument !== undefined && args.length === 0) {
      const location = config.location;

      if (location === undefined) {
        throw new UsageError(
          `missing required argument '${command.argument.name}'`,
        );
      }

      args =
        typeof location === "string"
          ? [location]
          : [String(location[0]), String(location[1])];
    }

    await command.run(args, flags, config);
    return 0;
  } catch (failure: unknown) {
    // The message may echo argv or an API field, so it gets the same pass as
    // the two above. The usage hint is built from our own text and stays as-is.
    const message = sanitizeText(
      failure instanceof Error ? failure.message : String(failure),
    );
    // The usage only helps when the invocation was wrong. A failed lookup is
    // the weather's fault, and reprinting the manual on top of it is noise.
    const hint = failure instanceof UsageError ? `\n\n${usage}` : "";

    console.error(`${styleError(`✗ ${message}`)}${hint}`);
    return 1;
  }
};
