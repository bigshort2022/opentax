import { expect, spyOn, test } from "bun:test";
import { checkForUpdate, updateCommand } from "./version.ts";
import { GITHUB_REPO, SELF_UPDATE_ENABLED } from "../version.ts";

test("California fork uses explicit versioned installs without automatic network updates", async () => {
  expect(GITHUB_REPO).toBe("bigshort2022/opentax");
  expect(SELF_UPDATE_ENABLED).toBe(false);
  const fetcher = spyOn(globalThis, "fetch").mockImplementation(() => {
    throw new Error("The fork updater must not fetch a replacement binary");
  });
  const output: string[] = [];
  const log = spyOn(console, "log").mockImplementation((message) => output.push(String(message)));
  try {
    await checkForUpdate();
    await updateCommand();
    expect(fetcher).not.toHaveBeenCalled();
    expect(output.join("\n")).toContain("Automatic updates are disabled");
    expect(output.join("\n")).toContain("https://github.com/bigshort2022/opentax/releases");
  } finally {
    fetcher.mockRestore();
    log.mockRestore();
  }
});
