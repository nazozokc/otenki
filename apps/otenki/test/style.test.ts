import { afterEach, describe, expect, test } from "bun:test";
import {
  colorTheme,
  error,
  heavy,
  setTheme,
  temperature,
  thunder,
  wet,
} from "../src/style.ts";
import { withColor } from "./support.ts";

const originalColorFgBg = process.env.COLORFGBG;

afterEach(() => {
  setTheme(undefined);
  if (originalColorFgBg === undefined) delete process.env.COLORFGBG;
  else process.env.COLORFGBG = originalColorFgBg;
});

describe("colorTheme", () => {
  test("assumes a dark terminal when nothing reports the background", () => {
    delete process.env.COLORFGBG;
    expect(colorTheme()).toBe("dark");
  });

  test("reads the background field of COLORFGBG", () => {
    process.env.COLORFGBG = "15;0";
    expect(colorTheme()).toBe("dark");

    process.env.COLORFGBG = "0;15";
    expect(colorTheme()).toBe("light");
  });

  test("an explicit theme beats the environment and `auto` follows it", () => {
    process.env.COLORFGBG = "0;15";
    setTheme("dark");
    expect(colorTheme()).toBe("dark");

    setTheme("auto");
    expect(colorTheme()).toBe("light");
  });
});

describe("palette", () => {
  test("dark terminals get the bright ANSI variants", () => {
    withColor(true, () => {
      setTheme("dark");

      expect(temperature("21.0℃")).toBe("\u001B[93m21.0℃\u001B[0m");
      expect(wet("0.4 mm")).toBe("\u001B[96m0.4 mm\u001B[0m");
      expect(thunder("雷雨")).toBe("\u001B[95m雷雨\u001B[0m");
      expect(error("✗ bad")).toBe("\u001B[91m✗ bad\u001B[0m");
      expect(heavy("大雨")).toBe("\u001B[1m\u001B[91m大雨\u001B[0m");
    });
  });

  test("light terminals get the base ANSI variants", () => {
    withColor(true, () => {
      setTheme("light");

      expect(temperature("21.0℃")).toBe("\u001B[33m21.0℃\u001B[0m");
      expect(wet("0.4 mm")).toBe("\u001B[36m0.4 mm\u001B[0m");
      expect(thunder("雷雨")).toBe("\u001B[35m雷雨\u001B[0m");
      expect(error("✗ bad")).toBe("\u001B[31m✗ bad\u001B[0m");
      expect(heavy("大雨")).toBe("\u001B[1m\u001B[31m大雨\u001B[0m");
    });
  });

  test("NO_COLOR beats the theme", () => {
    withColor(false, () => {
      setTheme("dark");

      expect(temperature("21.0℃")).toBe("21.0℃");
      expect(wet("0.4 mm")).toBe("0.4 mm");
    });
  });
});
