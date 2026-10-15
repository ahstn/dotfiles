import { expect, it } from "bun:test";
import { requestedTimeoutMs } from "./bootstrap.ts";

it("reads --timeout the way commander does: the last occurrence wins", () => {
  expect(requestedTimeoutMs(["--pr", "1"])).toBeNull();
  expect(requestedTimeoutMs(["--timeout", "540"])).toBe(540_000);
  expect(requestedTimeoutMs(["--timeout", "540", "--timeout", "1"])).toBe(1_000);
  expect(requestedTimeoutMs(["--timeout=540", "--timeout", "2"])).toBe(2_000);
  expect(requestedTimeoutMs(["--timeout", "5", "--", "--timeout", "1"])).toBe(5_000);
  expect(requestedTimeoutMs(["--timeout", "0"])).toBeNull();
});
