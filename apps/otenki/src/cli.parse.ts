/**
 * The command contract and the argument parser. Commander would do this, but
 * the surface area here is six subcommands, five boolean flags and one variadic
 * argument, so a table of commands plus a short parser is the cheaper trade: it
 * keeps the runtime free of dependencies and the behaviour completely legible.
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

/**
 * Anything that starts with `--` is an option attempt, value or not: without
 * that, `--json=true` would slip past the test below and become a place name,
 * so the caller would be told the place was not found instead of the option
 * being wrong. A single dash needs a leading letter, which keeps negative
 * latitudes (`otenki today -33.86 151.2`) as coordinates while a bundle like
 * `-hx` is still rejected as an option. `--` itself is caught ahead of this
 * test to end option parsing.
 */
export const isFlag = (token: string): boolean =>
  (token.startsWith("--") && token !== "--") || /^-[A-Za-z][\w-]*$/.test(token);

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
