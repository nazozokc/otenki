import { expect } from "bun:test";
import { styled } from "../src/style.ts";

/**
 * Pins `NO_COLOR` and `process.stdout.isTTY`, and returns the restore. `style.ts`
 * reads both on every call, and `bun test` runs with a terminal in some
 * sandboxes and without in others, which is enough to turn layout assertions
 * into escape-sequence soup. The guard on `styled()` matters as much as the
 * pin: without it a helper that never reaches `style.ts` would let a colour
 * assertion pass for the wrong reason.
 */
const pin = (color: boolean): (() => void) => {
  const stdout = process.stdout as { isTTY?: boolean };
  const wasTty = Object.getOwnPropertyDescriptor(stdout, "isTTY");
  const hadNoColor = process.env.NO_COLOR;

  Object.defineProperty(stdout, "isTTY", { value: color, configurable: true });
  if (color) delete process.env.NO_COLOR;
  else process.env.NO_COLOR = "1";

  return () => {
    if (wasTty === undefined) delete stdout.isTTY;
    else Object.defineProperty(stdout, "isTTY", wasTty);

    if (hadNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = hadNoColor;
  };
};

export const withColor = <T>(color: boolean, run: () => T): T => {
  const restore = pin(color);
  try {
    const result = run();
    expect(styled()).toBe(color);
    return result;
  } finally {
    restore();
  }
};

/**
 * The same pin held across an `await`: the rendering happens inside the
 * promise, after a synchronous helper would already have restored the
 * environment, so commands that hit the (mocked) network need this shape.
 */
export const withColorAsync = async <T>(
  color: boolean,
  run: () => Promise<T>,
): Promise<T> => {
  const restore = pin(color);
  try {
    const result = await run();
    expect(styled()).toBe(color);
    return result;
  } finally {
    restore();
  }
};

/** The same pin, with colour off: the reading a piped invocation gets. */
export const plain = <T>(run: () => T): T => withColor(false, run);
