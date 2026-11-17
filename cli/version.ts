/**
 * Version string. Set to "dev" in source.
 * CI replaces this value with the git tag before `bun build --compile`.
 */
export const VERSION = "dev";

/** GitHub owner/repo for release lookups */
export const GITHUB_REPO = "bigshort2022/opentax";

/** Fork releases are reviewed and installed explicitly; never switch release channels. */
export const SELF_UPDATE_ENABLED = false;
