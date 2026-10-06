import { commandHelp, help } from "./cli.help.ts";
import { type Command, isFlag, parseArgs, UsageError } from "./cli.parse.ts";
import { sanitizeText } from "./sanitize.ts";
import { error as styleError } from "./style.ts";

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

  const failUnknown = (name: string): number => {
    // The name is argv: strip control sequences before it reaches the terminal.
    const message = styleError(`✗ unknown command '${sanitizeText(name)}'`);
    console.error(`${message}\n\n${help(commands)}`);
    return 1;
  };

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

  // The token is shaped like an option, so calling it an unknown command would
  // send the reader looking in the wrong list. The mistake is its position.
  if (isFlag(first)) {
    const message = styleError(
      `✗ option '${sanitizeText(first)}' must come after the command`,
    );
    console.error(`${message}\n\n${help(commands)}`);
    return 1;
  }

  const command = commands.find((candidate) => candidate.name === first);

  if (command === undefined) {
    return failUnknown(first);
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
