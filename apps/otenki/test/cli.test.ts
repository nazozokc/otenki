import { describe, expect, spyOn, test } from "bun:test";
import { dispatch } from "../src/cli.dispatch.ts";
import { commandHelp, help } from "../src/cli.help.ts";
import {
  parseArgs,
  UsageError,
  type Command,
  type Flags,
} from "../src/cli.parse.ts";
import type { Config } from "../src/config.ts";

const noop = async (): Promise<void> => {};

const commands: Command[] = [
  {
    name: "today",
    description: "current weather",
    argument: { name: "location", description: "place name" },
    options: [{ flag: "json", description: "print raw JSON" }],
    run: noop,
  },
  {
    name: "cache",
    description: "manage the place name cache",
    options: [{ flag: "clear", description: "drop every cached lookup" }],
    run: noop,
  },
];

const capture = () => {
  const out: string[] = [];
  const err: string[] = [];
  spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    out.push(args.join(" "));
  });
  spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    err.push(args.join(" "));
  });

  return { out, err };
};

/** A command that remembers how dispatch called it, instead of running. */
const recording = () => {
  const calls: Array<{ args: string[]; flags: Flags; config: Config }> = [];
  const command: Command = {
    name: "today",
    description: "current weather",
    argument: { name: "location", description: "place name" },
    options: [{ flag: "json", description: "print raw JSON" }],
    run: async (args, flags, config) => {
      calls.push({ args, flags, config });
    },
  };

  return { calls, command };
};

describe("parseArgs", () => {
  test("splits flags from positional arguments", () => {
    const { flags, args } = parseArgs(["横浜", "--json"], ["json"]);

    expect(flags).toEqual({ json: true });
    expect(args).toEqual(["横浜"]);
  });

  test("collects a variadic argument in order", () => {
    const { args } = parseArgs(["横浜市", "神奈川"], ["json"]);

    expect(args).toEqual(["横浜市", "神奈川"]);
  });

  test("keeps a negative latitude as a coordinate", () => {
    // A flag is a dash followed by letters only, so `-33.86` stays a number.
    const { args } = parseArgs(["-33.86", "151.2"], ["json"]);

    expect(args).toEqual(["-33.86", "151.2"]);
  });

  test("treats everything after -- as positional", () => {
    const { flags, args } = parseArgs(["--json", "--", "--json"], ["json"]);

    expect(flags).toEqual({ json: true });
    expect(args).toEqual(["--json"]);
  });

  test("accepts a single letter alias", () => {
    expect(parseArgs(["-h"], ["h"]).flags).toEqual({ h: true });
  });

  test("rejects an option the command does not declare", () => {
    expect(() => parseArgs(["--pick"], ["json"])).toThrow(UsageError);
    expect(() => parseArgs(["--pick"], ["json"])).toThrow(
      "unknown option '--pick'",
    );
  });

  test("rejects an option written with a value instead of geocoding it", () => {
    // `=` must not turn `--json=true` into a place name.
    expect(() => parseArgs(["--json=true"], ["json"])).toThrow(
      "unknown option '--json=true'",
    );
    expect(() => parseArgs(["--json"], ["json"])).not.toThrow();
  });

  test("rejects a short option bundle instead of geocoding it", () => {
    // `-hx` is an option bundle; `-33.86` stays a coordinate (see above).
    expect(() => parseArgs(["-hx", "函館"], ["json"])).toThrow(
      "unknown option '-hx'",
    );
    expect(parseArgs(["-33.86", "151.2"], ["json"]).args).toEqual([
      "-33.86",
      "151.2",
    ]);
  });

  test("leaves flags unset when they are absent", () => {
    expect(parseArgs(["横浜"], ["json"]).flags).toEqual({});
  });
});

describe("help", () => {
  test("lists every command with its description", () => {
    const text = help(commands);

    expect(text).toContain("Usage: otenki <command> [options]");
    expect(text).toContain("today  current weather");
    expect(text).toContain("cache  manage the place name cache");
  });

  test("lists the built in options with their short forms", () => {
    const text = help(commands);

    expect(text).toContain("-V, --version");
    expect(text).toContain("-h, --help");
    expect(text).toContain("--no-config");
  });

  test("points at the config file", () => {
    const text = help(commands);

    expect(text).toContain("$XDG_CONFIG_HOME/otenki/config.json");
  });

  test("describes the positional argument of a command", () => {
    const text = commandHelp(commands[0] as Command);

    expect(text).toContain("Usage: otenki today <location...> [options]");
    expect(text).toContain("location  place name");
    expect(text).toContain("--json");
  });

  test("lists the global options in a single command's help too", () => {
    // `otenki today 横浜 --version` is accepted, so the help for the command
    // has to admit it exists.
    const text = commandHelp(commands[0] as Command);

    expect(text).toContain("-V, --version");
    expect(text).toContain("-h, --help");
    expect(text).toContain("--no-config");
  });

  test("omits the argument section when a command takes none", () => {
    expect(commandHelp(commands[1] as Command)).not.toContain("Arguments:");
  });
});

describe("dispatch", () => {
  test("prints the version and exits cleanly", async () => {
    const { out } = capture();

    expect(await dispatch(commands, ["--version"], "1.2.3")).toBe(0);
    expect(await dispatch(commands, ["-V"], "1.2.3")).toBe(0);
    expect(out).toEqual(["1.2.3", "1.2.3"]);
  });

  test("prints the version from behind a command and its arguments", async () => {
    const { out } = capture();

    // The command token comes first, so the global option only works when the
    // per-command parser is told about it.
    expect(
      await dispatch(commands, ["today", "横浜", "--version"], "1.2.3"),
    ).toBe(0);
    expect(await dispatch(commands, ["today", "-V"], "1.2.3")).toBe(0);
    expect(out).toEqual(["1.2.3", "1.2.3"]);
  });

  test("prints help when asked", async () => {
    const { out } = capture();

    expect(await dispatch(commands, ["--help"], "1.2.3")).toBe(0);
    expect(out[0]).toContain("Usage: otenki <command>");
  });

  test("prints help for a single command", async () => {
    const { out } = capture();

    expect(await dispatch(commands, ["today", "--help"], "1.2.3")).toBe(0);
    expect(out[0]).toContain("Usage: otenki today <location...>");
  });

  test("names the command after help, in either spelling", async () => {
    const { out } = capture();

    expect(await dispatch(commands, ["help", "today"], "1.2.3")).toBe(0);
    expect(await dispatch(commands, ["--help", "today"], "1.2.3")).toBe(0);
    expect(out[0]).toContain("Usage: otenki today <location...>");
    expect(out[1]).toContain("Usage: otenki today <location...>");
  });

  test("fails on help for a command that does not exist", async () => {
    const { err } = capture();

    expect(await dispatch(commands, ["help", "temprature"], "1.2.3")).toBe(1);
    expect(err[0]).toContain("unknown command 'temprature'");
  });

  test("blames the position when an option comes before the command", async () => {
    const { err } = capture();

    expect(await dispatch(commands, ["--json", "today", "横浜"], "1.2.3")).toBe(
      1,
    );
    expect(err[0]).toContain("option '--json' must come after the command");
    expect(err[0]).not.toContain("unknown command");
    expect(err[0]).toContain("Usage: otenki <command>");
  });

  test("passes the parsed arguments and flags to the command", async () => {
    const { out } = capture();
    const calls: Array<{ args: string[]; flags: Flags }> = [];

    const spy: Command = {
      name: "today",
      description: "current weather",
      argument: { name: "location", description: "place name" },
      options: [{ flag: "json", description: "print raw JSON" }],
      run: async (args, flags) => {
        calls.push({ args, flags });
      },
    };

    expect(await dispatch([spy], ["today", "横浜", "--json"], "1.2.3")).toBe(0);
    expect(calls).toEqual([{ args: ["横浜"], flags: { json: true } }]);
    expect(out).toHaveLength(0);
  });

  test("fails when a required argument is missing", async () => {
    const { err } = capture();

    expect(await dispatch(commands, ["today"], "1.2.3")).toBe(1);
    expect(err[0]).toContain("missing required argument 'location'");
    expect(err[0]).toContain("Usage: otenki today");
  });

  test("fails on an unknown option and shows the usage", async () => {
    const { err } = capture();

    expect(await dispatch(commands, ["today", "--nope", "横浜"], "1.2.3")).toBe(
      1,
    );
    expect(err[0]).toContain("unknown option '--nope'");
  });

  test("fails on an unknown command and lists the real ones", async () => {
    const { err } = capture();

    expect(await dispatch(commands, ["temprature", "横浜"], "1.2.3")).toBe(1);
    expect(err[0]).toContain("unknown command 'temprature'");
    expect(err[0]).toContain("today");
  });

  test("reports a command failure without reprinting the usage", async () => {
    const { err } = capture();
    const failing: Command = {
      name: "today",
      description: "current weather",
      argument: { name: "location", description: "place name" },
      options: [],
      run: async () => {
        throw new Error('"函館" の場所が見つかりませんでした');
      },
    };

    expect(await dispatch([failing], ["today", "函館"], "1.2.3")).toBe(1);
    expect(err[0]).toContain("場所が見つかりませんでした");
    expect(err[0]).not.toContain("Usage:");
  });

  test("prints help and fails when no command is given", async () => {
    const { err } = capture();

    expect(await dispatch(commands, [], "1.2.3")).toBe(1);
    expect(err[0]).toContain("Usage: otenki <command>");
  });

  test("lets a command reject its own flags and still get the usage", async () => {
    const { err } = capture();
    const strict: Command = {
      name: "cache",
      description: "manage the place name cache",
      options: [{ flag: "clear", description: "drop every cached lookup" }],
      run: async (_args, flags) => {
        if (flags.clear !== true)
          throw new UsageError("--clear を指定してください");
      },
    };

    // Throwing rather than calling process.exit is what keeps the exit code with
    // dispatch and the usage line in one place.
    expect(await dispatch([strict], ["cache"], "1.2.3")).toBe(1);
    expect(err[0]).toContain("--clear を指定してください");
    expect(err[0]).toContain("Usage: otenki cache");
  });
});

describe("dispatch with a config", () => {
  test("runs the configured command when none is given", async () => {
    const { out } = capture();
    const { calls, command } = recording();
    const config: Config = { command: "today", location: "函館" };

    expect(await dispatch([command], [], "1.2.3", config)).toBe(0);
    expect(calls).toEqual([{ args: ["函館"], flags: {}, config }]);
    expect(out).toHaveLength(0);
  });

  test("injects the configured location only when the argument is omitted", async () => {
    capture();
    const { calls, command } = recording();

    await dispatch([command], ["today"], "1.2.3", { location: "函館" });
    // An explicit place on the command line is what the reader wants: the
    // config default never gets a chance to override it.
    await dispatch([command], ["today", "横浜"], "1.2.3", {
      location: "函館",
    });
    expect(calls[0]?.args).toEqual(["函館"]);
    expect(calls[1]?.args).toEqual(["横浜"]);
  });

  test("injects a configured coordinate pair as two arguments", async () => {
    capture();
    const { calls, command } = recording();

    await dispatch([command], ["today"], "1.2.3", {
      location: [35.69, 139.69],
    });

    expect(calls[0]?.args).toEqual(["35.69", "139.69"]);
  });

  test("starts the configured command from an option-only invocation", async () => {
    capture();
    const { calls, command } = recording();

    // `otenki --json` with no command is `otenki today --json` here.
    expect(
      await dispatch([command], ["--json"], "1.2.3", {
        command: "today",
        location: "函館",
      }),
    ).toBe(0);
    expect(calls).toEqual([
      {
        args: ["函館"],
        flags: { json: true },
        config: { command: "today", location: "函館" },
      },
    ]);
  });

  test("stays missing-argument when the config has no location", async () => {
    const { err } = capture();

    expect(
      await dispatch(commands, ["today"], "1.2.3", { command: "today" }),
    ).toBe(1);
    expect(err[0]).toContain("missing required argument 'location'");
  });

  test("reports a configured command no command implements", async () => {
    const { err } = capture();

    expect(await dispatch(commands, [], "1.2.3", { command: "wekly" })).toBe(1);
    expect(err[0]).toContain("config: unknown command 'wekly'");
    expect(err[0]).toContain("Usage: otenki <command>");
  });

  test("keeps -V and -h ahead of the configured command", async () => {
    const { out } = capture();
    const config: Config = { command: "today", location: "函館" };

    expect(await dispatch(commands, ["-V"], "1.2.3", config)).toBe(0);
    expect(await dispatch(commands, ["--help"], "1.2.3", config)).toBe(0);
    expect(out[0]).toBe("1.2.3");
    expect(out[1]).toContain("Usage: otenki <command>");
  });

  test("passes the config object through to the command", async () => {
    capture();
    const { calls, command } = recording();
    const config: Config = { units: "imperial", days: 5 };

    await dispatch([command], ["today", "横浜"], "1.2.3", config);

    expect(calls[0]?.config).toBe(config);
  });
});
