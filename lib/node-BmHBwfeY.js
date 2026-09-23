import * as child_process from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import * as stream from "node:stream";
import * as util from "node:util";
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/node.mjs
/**
* The one module under `src/` that may import Node built-ins (eslint enforces this).
* The package.json `browser` field swaps it for `./node.browser`, so only touch its
* exports on code paths that run on Node-compatible runtimes.
*/
//#endregion
export { stream as a, path as i, crypto as n, util as o, fs as r, child_process as t };
