import { a as stream, i as path$1, n as crypto$1, o as util, r as fs$3, t as child_process } from "./node-BmHBwfeY.js";
import { a as checkMemorySyncInterval, c as decodeUTF8, d as AnthropicError, f as __classPrivateFieldGet, l as encodeUTF8, n as promiseWithResolvers, o as isStatus, p as __classPrivateFieldSet, s as loggerFor, u as ToolError } from "./sdk-BrEcWBXQ.js";
import * as cp from "node:child_process";
import * as fssync from "node:fs";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as crypto from "node:crypto";
import * as readline from "node:readline";
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/helpers/beta/json-schema.mjs
/**
* Creates a Tool with a provided JSON schema that can be passed
* to the `.toolRunner()` method. The schema is used to automatically validate
* the input arguments for the tool.
*/
function betaTool(options) {
	if (options.inputSchema.type !== "object") throw new Error(`JSON schema for tool "${options.name}" must be an object, but got ${options.inputSchema.type}`);
	return {
		type: "custom",
		name: options.name,
		input_schema: options.inputSchema,
		description: options.description,
		run: options.run,
		parse: (content) => content,
		...options.close ? { close: options.close } : {}
	};
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/tools/agent-toolset/fs-util.mjs
/**
* Shared, Node-only filesystem helpers for the agent toolset's file tools:
* path confinement (symlink-aware), an atomic write, and language-independent
* error messages. Kept out of `node.ts` so the tool implementations stay focused
* and these helpers can be reused by every file tool.
*/
const fs$2 = fs$3.promises;
/** True when `p` is `root` itself or lexically contained within it. */
function isWithin(root, p) {
	const rel = path$1.relative(root, p);
	return rel === "" || !rel.startsWith(".." + path$1.sep) && rel !== ".." && !path$1.isAbsolute(rel);
}
/**
* The first entry of `roots` whose canonical form contains the
* already-canonical `target`, returned as configured; `undefined` when none
* does. Each root goes through {@link canonicalize} at check time, exactly like
* the workdir in {@link confineToRoot}, so granting access (`allowedRoots`)
* and refusing writes (`readOnlyRoots`) can never resolve the same entry two
* different ways.
*/
async function containingRoot(roots, target) {
	for (const root of roots) if (isWithin(await canonicalize(path$1.resolve(root)), target)) return root;
}
/** Matches Linux MAXSYMLINKS, the threshold at which `realpath` itself reports ELOOP. */
const MAX_SYMLINK_HOPS = 40;
/** The `code` of a Node system error, or `undefined` for anything else. */
function errnoCode(err) {
	const code = err?.code;
	return typeof code === "string" ? code : void 0;
}
/**
* Fully resolve `abs`: `realpath` the longest existing ancestor and re-append
* the rest, but never re-append a component that is itself a symlink — read the
* link and continue from its target instead. This handles paths being created
* (write/edit) without letting a symlink leaf (e.g. a dangling one pointing
* outside a confinement root) slip through unresolved.
*
* Returns a symlink-free path or throws an errno-carrying error (`ELOOP` for a
* cycle or more than {@link MAX_SYMLINK_HOPS} links, the `lstat`/`realpath`
* error for an unreadable component); it never returns `abs` unresolved. Only
* symlink hops count against the cap, so any depth of not-yet-existing
* directories still resolves.
*/
async function canonicalize(abs) {
	const tail = [];
	let prefix = abs;
	let hops = 0;
	for (;;) {
		let real;
		try {
			real = await fs$2.realpath(prefix);
		} catch (realpathErr) {
			let isLink;
			try {
				isLink = (await fs$2.lstat(prefix)).isSymbolicLink();
			} catch (lstatErr) {
				const code = errnoCode(lstatErr);
				if (code !== "ENOENT" && code !== "ENOTDIR") throw lstatErr;
				const parent = path$1.dirname(prefix);
				if (parent === prefix) throw lstatErr;
				tail.push(path$1.basename(prefix));
				prefix = parent;
				continue;
			}
			if (!isLink) throw realpathErr;
			if (++hops > MAX_SYMLINK_HOPS) throw Object.assign(/* @__PURE__ */ new Error("too many levels of symbolic links"), { code: "ELOOP" });
			prefix = path$1.resolve(path$1.dirname(prefix), await fs$2.readlink(prefix));
			continue;
		}
		return tail.length ? path$1.join(real, ...tail.reverse()) : real;
	}
}
/**
* Resolve `p` against `root` and confine it to `root` or one of `allowedRoots`
* (absolute paths, resolved at check time exactly like `root`).
*
* Absolute and relative inputs go through the same canonicalise-then-contain
* check — an absolute path that lands inside a permitted root is accepted,
* only paths that resolve *outside* all of them are rejected. Every symlink in
* `p` (including the leaf, even a dangling one) is resolved before the
* confinement check, and the resolved path is what the caller then operates
* on, so a symlink inside `root` that points outside it can neither pass the
* check nor be followed afterwards. `..` is collapsed lexically before any
* symlink is followed. A path that cannot be resolved (symlink loop, unreadable
* component) is rejected with a `ToolError` naming `p`, never the host's
* absolute path.
*
* Residual TOCTOU: a component could still be swapped for a symlink between this
* call and the eventual `fs` operation. Closing that fully needs per-component
* `O_NOFOLLOW`/`openat`, which Node does not expose ergonomically; this is why a
* sandbox is still recommended for the toolset as a whole.
*/
async function confineToRoot(root, p, opts) {
	const allowedRoots = opts?.allowedRoots ?? [];
	const realRoot = await canonicalize(path$1.resolve(root));
	let real;
	try {
		real = await canonicalize(path$1.resolve(realRoot, p));
	} catch (err) {
		throw new ToolError(fsErrorMessage(err, `path ${JSON.stringify(p)}`));
	}
	if (isWithin(realRoot, real) || await containingRoot(allowedRoots, real) !== void 0) return real;
	const permitted = allowedRoots.length ? "the session's working directory and its other permitted directories" : "the session's working directory";
	throw new ToolError(`path ${JSON.stringify(p)} is outside ${permitted}`);
}
/**
* Atomically write `content` to `targetPath`: write a sibling temp file, fsync
* it, then rename over the target. The rename is atomic on most filesystems, so
* a crash mid-write never leaves the target half-written.
*/
async function atomicWriteFile(targetPath, content) {
	const dir = path$1.dirname(targetPath);
	const tempPath = path$1.join(dir, `.tmp-${process.pid}-${crypto$1.randomUUID()}`);
	let handle;
	try {
		handle = await fs$2.open(tempPath, "wx", 420);
		await handle.writeFile(content, "utf-8");
		await handle.sync();
		await handle.close();
		handle = void 0;
		await fs$2.rename(tempPath, targetPath);
	} catch (err) {
		if (handle) await handle.close().catch(() => {});
		await fs$2.unlink(tempPath).catch(() => {});
		throw err;
	}
}
/**
* Map a thrown filesystem error to a consistent, language-independent message,
* so the model sees the same wording regardless of the runtime (Node's raw
* `ENOENT: no such file...` text would otherwise leak through). Codes we don't
* special-case render as the bare code, never Node's message, which embeds the
* host's absolute path.
*/
function fsErrorMessage(err, file) {
	const code = errnoCode(err);
	switch (code) {
		case "ENOENT": return `${file}: no such file or directory`;
		case "EACCES":
		case "EPERM": return `${file}: permission denied`;
		case "ENOTDIR": return `${file}: not a directory`;
		case "EISDIR": return `${file}: is a directory`;
		case "ELOOP": return `${file}: too many levels of symbolic links`;
		case "ENAMETOOLONG": return `${file}: file name too long`;
		case "ENOSPC": return `${file}: no space left on device`;
		case "EMFILE":
		case "ENFILE": return `${file}: too many open files`;
		default: return `${file}: ${code !== void 0 ? `i/o error (${code})` : "i/o error"}`;
	}
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/tools/agent-toolset/skills.mjs
/**
* Node-only skill plumbing for the agent toolset: downloading a session
* agent's skills into the workdir and extracting the archives. Kept in its own
* file because it is a distinct concern from the tool implementations in
* `node.ts` — distinct enough, and large enough, to review on its own.
*/
const fs$1 = fs$3.promises;
const execFileAsync = util.promisify(child_process.execFile);
/**
* Download the session agent's skills into `{ctx.workdir}/skills/<name>/`.
*
* No-op (returns a no-op cleanup) unless `ctx.client` is set together with
* `ctx.session` (or the deprecated `ctx.sessionId`). Reads the resolved agent
* off the session and, for each skill, fetches its files via
* `client.beta.skills.versions.download` and extracts the archive (a zip or
* tar.* archive) into a directory named after the skill. A failure on one skill
* is logged and does not block the others. Call this before starting the
* session tool runner (e.g. right after the bash session / workdir is ready).
*
* Pass `ctx.session`. A session's resources cannot change while it runs, so the
* caller fetches it once and shares that snapshot with the memory-store
* download — the two can then never disagree about the attached resources.
*
* `ctx.sessionId` is deprecated: it costs an extra `sessions.retrieve` round
* trip on every call, and a caller that uses it for both this and the
* memory-store download fetches the session twice. It remains supported for
* callers written before `session` existed.
*
* Returns a cleanup function that removes the skill directories this call
* created — call it once the work item is done so downloaded skills do not
* accumulate in the workdir across sessions.
*/
async function setupSkills(ctx) {
	const { client, sessionId } = ctx;
	if (!client) return async () => {};
	const log = loggerFor(client);
	let session = ctx.session;
	if (!session) {
		if (sessionId === void 0) return async () => {};
		log.warn("AgentToolContext.sessionId is deprecated and costs an extra session fetch; fetch the session once and set `session` instead", { component: "agent-tool-context" });
		session = await client.beta.sessions.retrieve(sessionId);
	}
	const skillsRoot = path$1.resolve(ctx.workdir, "skills");
	const created = [];
	for (const skill of session.agent.skills) try {
		const version = await client.beta.skills.versions.retrieve(skill.version, { skill_id: skill.skill_id });
		let dirname = path$1.basename(version.name.trim());
		if (dirname === "" || dirname === "." || dirname === "..") dirname = skill.skill_id;
		const dest = path$1.resolve(skillsRoot, dirname);
		if (dest !== skillsRoot && !dest.startsWith(skillsRoot + path$1.sep)) {
			log.warn("skill name escapes the skills dir; skipping", {
				component: "agent-tool-context",
				name: version.name
			});
			continue;
		}
		const resp = await client.beta.skills.versions.download(version.id, { skill_id: skill.skill_id });
		await fs$1.rm(dest, {
			recursive: true,
			force: true
		});
		await fs$1.mkdir(dest, {
			recursive: true,
			mode: 493
		});
		created.push(dest);
		await extractSkillArchive(resp, dest);
		log.info("downloaded skill", {
			component: "agent-tool-context",
			skill_id: skill.skill_id,
			version: version.id,
			dest
		});
	} catch (e) {
		log.warn("failed to download skill", {
			component: "agent-tool-context",
			skill_id: skill.skill_id,
			error: String(e)
		});
	}
	return async () => {
		for (const dest of created) await fs$1.rm(dest, {
			recursive: true,
			force: true
		}).catch((e) => {
			log.warn("failed to clean up skill", {
				component: "agent-tool-context",
				dest,
				error: String(e)
			});
		});
	};
}
/** Reject archive members that are absolute or contain a `..` component. */
function assertSafeMemberNames(names) {
	for (const raw of names) {
		const entry = raw.trim();
		if (!entry) continue;
		if (path$1.isAbsolute(entry) || entry.split(/[\\/]/).includes("..")) throw new AnthropicError(`refusing to extract unsafe archive member: ${entry}`);
	}
}
const INCONSISTENT_LISTING = "skill archive listing is inconsistent; refusing to extract";
/**
* Type chars (first byte of each `ls`-style line from `unzip -Z` / `tar -tvf`)
* that denote a regular file or directory. `zipinfo` prints `?` for entries
* with no Unix type bits, which `unzip` extracts as regular files; GNU tar
* prints `C` for contiguous files. Everything else — `l` symlink, `h`
* hardlink, `b`/`c` device, `p` fifo, `s` socket, unknown tar types — is a
* special member.
*/
const PLAIN_TYPE_CHARS = {
	unzip: /* @__PURE__ */ new Set([
		"-",
		"d",
		"?"
	]),
	tar: /* @__PURE__ */ new Set([
		"-",
		"d",
		"C"
	])
};
function listingLines(listing) {
	const lines = listing.split("\n");
	if (lines[lines.length - 1] === "") lines.pop();
	return lines;
}
/**
* A special member is excluded by handing its listed name back to the CLI as
* a pattern, so the name must be byte-identical to what is stored. `tar`,
* `bsdtar` and `unzip` print bytes they cannot show literally as `\ooo`, `^X`
* or `#U` escapes, or as raw non-ASCII; any such name cannot be excluded
* reliably. A leading `-` would let `unzip` parse the pattern as an option.
*/
function canExcludeVerbatim(cmd, name) {
	return /^[\x20-\x7E]+$/.test(name) && !/[\\^#]/.test(name) && !(cmd === "unzip" && name.startsWith("-"));
}
/**
* Pair an archive's name listing (`unzip -Z1` / `tar -tf`) with its typed
* listing (`unzip -Z --h --t` / `tar -tvf`) and split the members into plain
* (regular file or directory) and special (everything else). Special members
* are excluded from extraction rather than rejected; the archive is refused
* only when the two listings disagree in length or a special member's name
* cannot be passed back to the CLI verbatim (see {@link canExcludeVerbatim}).
*/
function classifyArchiveListing(cmd, names, typed) {
	const nameLines = listingLines(names);
	const typedLines = listingLines(typed);
	if (nameLines.length !== typedLines.length) throw new AnthropicError(INCONSISTENT_LISTING);
	const plain = [];
	const special = [];
	nameLines.forEach((name, i) => {
		if (PLAIN_TYPE_CHARS[cmd].has(typedLines[i].charAt(0))) {
			plain.push(name);
			return;
		}
		if (!canExcludeVerbatim(cmd, name)) throw new AnthropicError(`refusing to extract archive: cannot safely exclude member ${JSON.stringify(name)}`);
		special.push(name);
	});
	return {
		plain,
		special
	};
}
/**
* Walk `dir` with `lstat` semantics and reject anything that is not a regular
* file or directory. Never follows a link and never descends into anything
* but a real directory.
*/
async function assertOnlyPlainEntries(dir) {
	for (const entry of await fs$1.readdir(dir, { withFileTypes: true })) if (entry.isDirectory()) await assertOnlyPlainEntries(path$1.join(dir, entry.name));
	else if (!entry.isFile()) throw new AnthropicError(INCONSISTENT_LISTING);
}
/**
* Run an archive CLI (`unzip` for zip archives, `tar` for everything else),
* returning its stdout. Both binaries must be on `PATH`; a missing one would
* otherwise surface as an opaque `ENOENT` spawn failure, so it is turned into a
* clear, specific error naming the missing command.
*/
async function runArchiveTool(cmd, args) {
	try {
		const { stdout } = await execFileAsync(cmd, args);
		return stdout;
	} catch (e) {
		if (errnoCode(e) === "ENOENT") throw new AnthropicError(`skill extraction requires the \`${cmd}\` command, but it was not found on PATH`);
		throw e;
	}
}
/**
* The single top-level directory shared by every entry in an archive listing,
* or `''` if entries don't all live under one common directory. Skill bundles
* are packaged wrapped in one directory named after the skill (e.g.
* `pdf/SKILL.md`, `pdf/scripts/...`); the extractor strips it so contents land
* directly in the skill's dir instead of a redundant nested `<skill>/<skill>/`
* level. A flat or multi-root archive yields `''`.
*/
function archiveTopDir(names) {
	let top;
	let nested = false;
	for (const raw of names) {
		const parts = raw.trim().split("/").filter((p) => p !== "" && p !== ".");
		if (parts.length === 0) continue;
		const first = parts[0];
		if (top === void 0) top = first;
		else if (first !== top) return "";
		if (parts.length > 1) nested = true;
	}
	return top !== void 0 && nested ? top : "";
}
/**
* Extract a skill download (a zip or tar.* archive) into `dest`. Streams the
* response body straight to a temp file beside `dest` (so the whole archive is
* never buffered in memory — skills can contain large binaries), then shells out
* to `unzip`/`tar` — consistent with the rest of the toolset, which already
* invokes `bash` and `rg`. Both `unzip` and `tar` must be available on `PATH`; a
* missing binary surfaces as a clear error (see {@link runArchiveTool}). Refuses
* any member that would escape `dest` (zip-slip / tar-slip): skill archives
* come from the API, but skills can be third-party. Members that are not a
* regular file or directory (symlink, hardlink, device, fifo) are excluded
* from extraction rather than rejected; an archive whose special members
* cannot be excluded reliably is refused (see {@link classifyArchiveListing}).
* `tar` matches exclusions unanchored, so a plain member sharing a special
* member's name may be dropped too. The staging tree is verified to hold only
* regular files and directories before anything is promoted into `dest`.
*
* The skill bundle's single wrapper directory is stripped: the archive is
* extracted into a staging dir and the wrapper's contents are promoted into
* `dest`, so files land at `dest/SKILL.md` rather than a doubled
* `dest/<skill>/SKILL.md` (`unzip` has no `--strip-components`, so this is
* done uniformly by staging + promote rather than per-tool flags).
*/
async function extractSkillArchive(resp, dest) {
	const tmp = path$1.join(dest, `.skill-archive-${process.pid}-${Date.now()}`);
	if (!resp.body) throw new AnthropicError("skill download response had no body");
	await stream.promises.pipeline(stream.Readable.fromWeb(resp.body), fs$3.createWriteStream(tmp));
	const stage = path$1.join(path$1.dirname(dest), `.skill-stage-${process.pid}-${Date.now()}`);
	const excludeFile = path$1.join(path$1.dirname(dest), `.skill-exclude-${process.pid}-${Date.now()}`);
	try {
		const head = await readHead(tmp, 4);
		const isZip = head.length >= 4 && head[0] === 80 && head[1] === 75 && head[2] === 3 && head[3] === 4;
		const archiveCmd = isZip ? "unzip" : "tar";
		const { plain, special } = classifyArchiveListing(archiveCmd, await runArchiveTool(archiveCmd, isZip ? ["-Z1", tmp] : ["-tf", tmp]), await runArchiveTool(archiveCmd, isZip ? [
			"-Z",
			"--h",
			"--t",
			tmp
		] : ["-tvf", tmp]));
		assertSafeMemberNames([...plain, ...special]);
		const top = archiveTopDir(plain);
		await fs$1.mkdir(stage, {
			recursive: true,
			mode: 493
		});
		if (plain.length > 0) await runArchiveTool(archiveCmd, await extractArgs(archiveCmd, tmp, stage, special, excludeFile));
		await assertOnlyPlainEntries(stage);
		const srcRoot = top ? path$1.join(stage, top) : stage;
		const entries = await fs$1.readdir(srcRoot).catch((e) => {
			throw errnoCode(e) === "ENOENT" ? new AnthropicError(INCONSISTENT_LISTING) : e;
		});
		for (const entry of entries) await fs$1.rename(path$1.join(srcRoot, entry), path$1.join(dest, entry));
	} finally {
		await fs$1.rm(tmp, { force: true });
		await fs$1.rm(excludeFile, { force: true });
		await fs$1.rm(stage, {
			recursive: true,
			force: true
		});
	}
}
/**
* Arguments that extract `archive` into `stage` while excluding every member
* in `special`. Names are glob-escaped because both CLIs treat exclusions as
* patterns; `tar` reads them from `excludeFile`, `unzip` takes them after
* `-x`, which must follow `-d` so no pattern is parsed as an option.
*/
async function extractArgs(cmd, archive, stage, special, excludeFile) {
	const patterns = special.map((name) => name.replace(/[*?[\\]/g, "\\$&"));
	if (cmd === "unzip") return [
		"-oq",
		archive,
		"-d",
		stage,
		...patterns.length > 0 ? ["-x", ...patterns] : []
	];
	if (patterns.length === 0) return [
		"-xf",
		archive,
		"-C",
		stage
	];
	await fs$1.writeFile(excludeFile, patterns.join("\n") + "\n", {
		flag: "wx",
		mode: 384
	});
	return [
		"-xf",
		archive,
		"-C",
		stage,
		"-X",
		excludeFile
	];
}
/** Read the first `n` bytes of `file`. */
async function readHead(file, n) {
	const handle = await fs$1.open(file, "r");
	try {
		const buf = Buffer.alloc(n);
		const { bytesRead } = await handle.read(buf, 0, n, 0);
		return buf.subarray(0, bytesRead);
	} finally {
		await handle.close();
	}
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/internal/file-store.mjs
/**
* `FileStore` — one confined folder; a relative path cannot escape it.
*
* Beta scope: symlinks are refused or skipped wherever the store meets them,
* but there is no hardening against a process racing the store's own
* syscalls; fsync durability, non-POSIX hosts, and read-size caps are out of
* scope.
*/
const fsp = fs$3.promises;
const C = fs$3.constants;
const OWNER_ONLY_DIR_MODE = 448;
const OWNER_ONLY_FILE_MODE = 384;
const OWNER_ONLY_EXEC_MODE = 448;
const O_NOFOLLOW = C.O_NOFOLLOW ?? 0;
const O_NONBLOCK = C.O_NONBLOCK ?? 0;
/** A refused operation — input the store will not act on. OS errors propagate with their `.code`. */
var FileStoreError = class extends Error {
	constructor(reason, relPath) {
		super(`path ${JSON.stringify(relPath)} ${reason}`);
		this.name = "FileStoreError";
		this.reason = reason;
		this.relPath = relPath;
	}
};
FileStoreError.ESCAPES_ROOT = "escapes the store root";
FileStoreError.IS_A_SYMLINK = "is a symlink";
FileStoreError.NOT_A_FILE = "is not a regular file";
FileStoreError.NOT_A_DIRECTORY = "is not a directory";
FileStoreError.NOT_UTF8 = "is not valid utf-8";
FileStoreError.MOVE_DESTINATION_EXISTS = "already exists";
/**
* True for a path usable verbatim as a store location: absolute, with no `..`
* components. Paths are judged in POSIX terms — they are wire values naming
* locations inside a POSIX container, not host-native paths.
*/
function isPathLegal(p) {
	return p.startsWith("/") && !p.split("/").includes("..");
}
/**
* One confined folder of regular files.
*
* Every `relPath` is relative to the root (a leading `/` also means the root)
* and refused with {@link FileStoreError} when it escapes. The store holds
* regular files only: symlinks are refused on read and skipped by listings —
* {@link findSymlinks} reports them. A `relPath` resolving to the root itself
* is banned by this interface: `put` and `get` refuse it, `move` and `remove`
* do nothing. A store opened with `utf8: true` refuses binary content the
* same way — on `put` of such bytes and on `get` of such a file. Only
* {@link createRoot} makes the root: writes create directories below it,
* never the root itself, so a root removed while the store is open stays
* removed and the write fails with `ENOENT`.
*/
var FileStore = class FileStore {
	/** @internal — use {@link FileStore.open} / {@link openFileStore}. */
	constructor(root, removedOnDispose, utf8Only = false) {
		/** `hashtree`'s advisory cache; every hit re-validates against a fresh stat. */
		this.hashes = /* @__PURE__ */ new Map();
		this.rootPath = root;
		this.removedOnDispose = removedOnDispose;
		this.decoder = utf8Only ? new TextDecoder("utf-8", { fatal: true }) : void 0;
	}
	/** Resolve `root`; creates nothing — only {@link createRoot} makes the folder. */
	static async open(root, opts) {
		if (!platformSupported()) throw new Error("FileStore requires O_NOFOLLOW support on this platform");
		let removedOnDispose = false;
		try {
			await fsp.lstat(root);
		} catch (e) {
			if (e.code !== "ENOENT") throw e;
			removedOnDispose = true;
		}
		return new FileStore(path$1.resolve(root), removedOnDispose, opts?.utf8 ?? false);
	}
	/** Create the root directory and any missing ancestors; already existing is fine. */
	async createRoot() {
		await makeDirAndAncestors(this.rootPath);
	}
	/** The resolved root, and what {@link dispose} will do to it. */
	root() {
		return {
			path: this.rootPath,
			removedOnDispose: this.removedOnDispose
		};
	}
	/**
	* Remove the root iff `open` created it; pre-existing roots are kept.
	*
	* Wired to `Symbol.asyncDispose` at runtime when the host provides it, so
	* `await using` works on engines with explicit resource management.
	*/
	async dispose() {
		if (!this.removedOnDispose) return;
		await fsp.rm(this.rootPath, {
			recursive: true,
			force: true
		});
	}
	/**
	* Write `data` (`string` UTF-8 or bytes) atomically to the file at `relPath`.
	*
	* Missing directories below the root are created; a missing root is not —
	* the write fails with `ENOENT`.
	*/
	async put(relPath, data, opts) {
		const tail = relPath.replace(/\\/g, "/");
		if (tail.endsWith("/") || tail.endsWith("/.") || tail === "" || tail === ".") throw new FileStoreError(FileStoreError.NOT_A_FILE, relPath);
		const dest = this.resolveUnderRoot(relPath);
		const payload = typeof data === "string" ? encodeUTF8(data) : data;
		this.requireUtf8(relPath, payload);
		await makeDirsBelowRoot(this.rootPath, path$1.dirname(dest));
		await replaceViaTemp(dest, payload, opts?.executable ?? false);
	}
	/** The file's bytes; `null` when absent. */
	async get(relPath) {
		const dest = this.resolveUnderRoot(relPath);
		let handle;
		try {
			handle = await openRegularFile(relPath, dest);
		} catch (e) {
			if (e.code === "ENOENT") return null;
			throw e;
		}
		let data;
		try {
			const buf = await handle.readFile();
			data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
		} finally {
			await handle.close();
		}
		this.requireUtf8(relPath, data);
		return data;
	}
	/** The relative path of every file under the directory `under`. */
	async ls(under = "/") {
		const base = this.resolveUnderRoot(under);
		return new Set((await filenamesInDir(this.rootPath, under, base)).map(([rel]) => rel));
	}
	/**
	* Every symlink under `under` — listings skip them and reads refuse them,
	* so a caller that must know they exist asks here.
	*/
	async findSymlinks(under = "/") {
		const base = this.resolveUnderRoot(under);
		return symlinksInDir(this.rootPath, under, base);
	}
	/**
	* `{relPath: sha256Hex}` of every file under the directory `under`.
	*
	* Unchanged files — same size, mtime, and ctime since the last call —
	* reuse their recorded hash instead of being re-read.
	*/
	async hashtree(under = "/") {
		const base = this.resolveUnderRoot(under);
		const walkStartNs = _internals.nowNs();
		const out = Object.create(null);
		for (const [rel, full] of await filenamesInDir(this.rootPath, under, base)) {
			const sha = await this.hashViaCache(rel, full, walkStartNs);
			if (sha !== null) out[rel] = sha;
		}
		return out;
	}
	/** One file's sha256; `null` when absent. Shares {@link hashtree}'s cache. */
	async hashFile(relPath) {
		const dest = this.resolveUnderRoot(relPath);
		let st;
		try {
			st = await fsp.lstat(dest, { bigint: true });
		} catch (e) {
			if (e.code === "ENOENT") return null;
			throw e;
		}
		if (st.isSymbolicLink()) throw new FileStoreError(FileStoreError.IS_A_SYMLINK, relPath);
		if (!st.isFile()) throw new FileStoreError(FileStoreError.NOT_A_FILE, relPath);
		const rel = path$1.relative(this.rootPath, dest).split(path$1.sep).join("/");
		return this.hashViaCache(rel, dest, _internals.nowNs());
	}
	/**
	* Rename `src` to `dst`; an existing `dst` is refused. The banned store
	* root as either end does nothing.
	*/
	async move(src, dst) {
		const s = this.resolveUnderRoot(src);
		const d = this.resolveUnderRoot(dst);
		if (s === this.rootPath || d === this.rootPath) return;
		if (await fsp.stat(d).then(() => true, () => false)) throw new FileStoreError(FileStoreError.MOVE_DESTINATION_EXISTS, dst);
		await makeDirsBelowRoot(this.rootPath, path$1.dirname(d));
		await fsp.rename(s, d);
	}
	/** Delete a file or subtree; absent — and the banned store root — do nothing. */
	async remove(relPath) {
		const dest = this.resolveUnderRoot(relPath);
		if (dest === this.rootPath) return;
		let st;
		try {
			st = await fsp.lstat(dest, { bigint: true });
		} catch (e) {
			if (e.code === "ENOENT") return;
			throw e;
		}
		if (st.isDirectory()) await fsp.rm(dest, {
			recursive: true,
			force: true
		});
		else try {
			await fsp.unlink(dest);
		} catch (e) {
			if (e.code !== "ENOENT") throw e;
		}
	}
	resolveUnderRoot(relPath) {
		const norm = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
		const parts = norm.split("/").filter((p) => p !== "" && p !== ".");
		if (path$1.posix.isAbsolute(norm) || parts.includes("..")) throw new FileStoreError(FileStoreError.ESCAPES_ROOT, relPath);
		return parts.length === 0 ? this.rootPath : path$1.join(this.rootPath, ...parts);
	}
	requireUtf8(relPath, data) {
		if (!this.decoder) return;
		try {
			this.decoder.decode(data);
		} catch {
			throw new FileStoreError(FileStoreError.NOT_UTF8, relPath);
		}
	}
	async hashViaCache(rel, full, walkStartNs) {
		let st;
		try {
			st = await fsp.lstat(full, { bigint: true });
		} catch (e) {
			if (e.code === "ENOENT") return null;
			throw e;
		}
		if (!st.isFile()) return null;
		const cached = this.hashes.get(rel);
		let sha;
		if (cached !== void 0 && unchangedSinceHashed(cached, st)) sha = cached.sha;
		else try {
			sha = await _internals.hashFile(full);
		} catch (e) {
			const code = e.code;
			if (code === "ENOENT" || e instanceof FileStoreError) return null;
			if (code === "ELOOP" || code === "EMLINK") return null;
			throw e;
		}
		if (oldEnoughToCache(st, walkStartNs)) this.hashes.set(rel, {
			mtimeNs: st.mtimeNs,
			ctimeNs: st.ctimeNs,
			size: st.size,
			sha
		});
		return sha;
	}
};
FileStore.isPathLegal = isPathLegal;
function platformSupported() {
	return O_NOFOLLOW !== 0;
}
async function makeDirAndAncestors(dir) {
	const missing = [];
	let current = dir;
	for (;;) {
		try {
			await fsp.stat(current);
			break;
		} catch (e) {
			const code = e.code;
			if (code !== "ENOENT" && code !== "ENOTDIR" && code !== "ELOOP") throw e;
		}
		missing.push(current);
		const parent = path$1.dirname(current);
		if (parent === current) break;
		current = parent;
	}
	for (const directory of missing.reverse()) try {
		await fsp.mkdir(directory, { mode: OWNER_ONLY_DIR_MODE });
	} catch (e) {
		if (e.code !== "EEXIST") throw e;
	}
}
async function makeDirsBelowRoot(root, dir) {
	const below = path$1.relative(root, dir);
	if (below === "") return;
	let current = root;
	for (const part of below.split(path$1.sep)) {
		current = path$1.join(current, part);
		try {
			await fsp.mkdir(current, { mode: OWNER_ONLY_DIR_MODE });
		} catch (e) {
			if (e.code !== "EEXIST") throw e;
		}
	}
}
async function replaceViaTemp(dest, data, isExecutable) {
	const mode = isExecutable ? OWNER_ONLY_EXEC_MODE : OWNER_ONLY_FILE_MODE;
	const tmp = path$1.join(path$1.dirname(dest), `.fs-${crypto$1.randomBytes(8).toString("hex")}.tmp`);
	let handle;
	try {
		handle = await fsp.open(tmp, C.O_WRONLY | C.O_CREAT | C.O_EXCL | O_NOFOLLOW, mode);
		await handle.writeFile(data);
		await handle.close();
		handle = void 0;
		await fsp.rename(tmp, dest);
	} catch (err) {
		if (handle) await handle.close().catch(() => {});
		await fsp.unlink(tmp).catch(() => {});
		throw err;
	}
}
async function openRegularFile(relPath, dest) {
	let handle;
	try {
		handle = await fsp.open(dest, C.O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
	} catch (e) {
		const code = e.code;
		if (code === "ELOOP" || code === "EMLINK") throw new FileStoreError(FileStoreError.IS_A_SYMLINK, relPath);
		throw e;
	}
	try {
		if (!(await handle.stat()).isFile()) throw new FileStoreError(FileStoreError.NOT_A_FILE, relPath);
	} catch (e) {
		await handle.close().catch(() => {});
		throw e;
	}
	return handle;
}
/** sha256 of a file's contents, streamed — constant memory on any file size. */
async function hashFile(full) {
	const digest = crypto$1.createHash("sha256");
	const handle = await openRegularFile(path$1.basename(full), full);
	const buf = /* @__PURE__ */ new Uint8Array(1048576);
	try {
		for (;;) {
			const { bytesRead } = await handle.read(buf, 0, buf.length);
			if (bytesRead === 0) break;
			digest.update(buf.subarray(0, bytesRead));
		}
	} finally {
		await handle.close();
	}
	return digest.digest("hex");
}
/**
* `[rel, path]` for every regular file under the directory `base`; an absent
* `base` is empty, a present non-directory is refused. The walk never
* descends symlinked directories.
*/
async function filenamesInDir(root, under, base) {
	if (!await requireDir(under, base)) return [];
	const out = [];
	await walk$1(base, (full, entry) => {
		if (entry.isFile()) out.push([path$1.relative(root, full).split(path$1.sep).join("/"), full]);
	});
	out.sort();
	return out;
}
async function symlinksInDir(root, under, base) {
	const relOf = (full) => path$1.relative(root, full).split(path$1.sep).join("/");
	let st;
	try {
		st = await fsp.lstat(base, { bigint: true });
	} catch (e) {
		const code = e.code;
		if (code === "ENOENT" || code === "ENOTDIR") return /* @__PURE__ */ new Set();
		throw e;
	}
	if (st.isSymbolicLink()) return /* @__PURE__ */ new Set([relOf(base)]);
	if (!st.isDirectory()) throw new FileStoreError(FileStoreError.NOT_A_DIRECTORY, under);
	const out = /* @__PURE__ */ new Set();
	await walk$1(base, (full, entry) => {
		if (entry.isSymbolicLink()) out.add(relOf(full));
	});
	return out;
}
/** `false` when `base` is absent, refused when present but not a directory. */
async function requireDir(under, base) {
	let st;
	try {
		st = await fsp.lstat(base, { bigint: true });
	} catch (e) {
		const code = e.code;
		if (code === "ENOENT" || code === "ENOTDIR") return false;
		throw e;
	}
	if (!st.isDirectory()) throw new FileStoreError(FileStoreError.NOT_A_DIRECTORY, under);
	return true;
}
/** Visit every entry under `base` without descending symlinked directories. */
async function walk$1(base, visit) {
	const stack = [base];
	while (stack.length) {
		const dir = stack.pop();
		let entries;
		try {
			entries = await fsp.readdir(dir, { withFileTypes: true });
		} catch (e) {
			if (e.code === "ENOENT") continue;
			throw e;
		}
		for (const entry of entries) {
			const full = path$1.join(dir, entry.name);
			visit(full, entry);
			if (entry.isDirectory() && !entry.isSymbolicLink()) stack.push(full);
		}
	}
}
function unchangedSinceHashed(cached, st) {
	return st.mtimeNs === cached.mtimeNs && st.ctimeNs === cached.ctimeNs && st.size === cached.size;
}
function oldEnoughToCache(st, walkStartNs) {
	return (st.mtimeNs > st.ctimeNs ? st.mtimeNs : st.ctimeNs) < walkStartNs - _internals.timestampTrustMarginNs;
}
/** Test seam — the hasher, the trust margin, and the walk clock. @internal */
const _internals = {
	hashFile,
	timestampTrustMarginNs: 2000000000n,
	nowNs: () => BigInt(Date.now()) * 1000000n
};
const LocalFileStore = FileStore;
const asyncDispose = Symbol.asyncDispose;
if (asyncDispose) Object.defineProperty(FileStore.prototype, asyncDispose, {
	value: FileStore.prototype.dispose,
	configurable: true,
	writable: true
});
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/tools/agent-toolset/memories.mjs
/**
* Session-level memory-store download and sync.
*
* A session may have several memory stores attached. This module resolves
* where each store's folder goes on disk, opens a {@link LocalFileStore}
* there, and reconciles each folder with its remote store — the merge rules
* live on {@link SessionMemoryStores}.
*
* Node-only (it sits on the filesystem-backed FileStore); like `skills.ts`,
* it is reachable through the shimmed `node.ts` entry point.
*/
var _SessionMemoryStores_instances;
var _SessionMemoryStores_client;
var _SessionMemoryStores_workdir;
var _SessionMemoryStores_syncIntervalMs;
var _SessionMemoryStores_syncDeletions;
var _SessionMemoryStores_log;
var _SessionMemoryStores_lastSyncAt;
var _SessionMemoryStores_finished;
var _SessionMemoryStores_stores;
var _SessionMemoryStores_storeRoot;
var _SessionMemoryStores_scanMarker;
var _SessionMemoryStores_syncStore;
var _SessionMemoryStores_flushStore;
var _SessionMemoryStores_recover;
var _SessionMemoryStores_stampAndPull;
var _SessionMemoryStores_syncPath;
var _SessionMemoryStores_removeLocal;
var _SessionMemoryStores_write;
var _SessionMemoryStores_pullAll;
var _SessionMemoryStores_uploadAll;
var _SessionMemoryStores_listMemories;
var _SessionMemoryStores_upload;
var _SessionMemoryStores_corroboratedDelete;
var _SessionMemoryStores_deleteRemote;
/**
* Time bound the worker puts on each teardown pass — the final
* {@link SessionMemoryStores.finish}, then {@link SessionMemoryStores.flushWrites} —
* so a slow server cannot stall teardown.
*/
const MEMORY_FLUSH_TIMEOUT_MS = 3e4;
/**
* Marker file stamped into every store folder; a sync trusts the folder only
* when it matches. Never itself syncs.
*/
const MARKER_PATH = ".anthropic-memory-store";
const MARKER_VERSION = 1;
function markerSha(memoryStoreId) {
	return crypto$1.createHash("sha256").update(`version ${MARKER_VERSION}\n${memoryStoreId}`, "utf-8").digest("hex");
}
/**
* Page sizes for memory listings — the API's maximum per view: `basic` pages
* carry up to 100 items, `full` pages are capped by the server.
*/
const LIST_PAGE_SIZE = 100;
const FULL_LIST_PAGE_SIZE = 20;
/**
* How many single-memory content fetches may be in flight at once during one
* store's pull pass. A sync rarely pulls more than a handful of memories, so
* a higher cap buys nothing in the common case.
*/
const FETCH_CONCURRENCY = 16;
/**
* Per-sync remote-delete cap bounds. The floor lets a small store's
* deletes clear in one pass; the ceiling caps damage on large ones.
*/
const DELETE_CAP_FLOOR = 8;
const DELETE_CAP_CEILING = 50;
/**
* A session's memory stores could not be mounted.
*
* Thrown by {@link SessionMemoryStores.download} when a store cannot be
* materialised on disk, and by the environment worker when a work item for a
* session that has memory stores carried no sessions token to reach them with.
*/
var SessionMemoryError = class extends AnthropicError {
	constructor(message, cause) {
		super(message);
		this.name = "SessionMemoryError";
		if (cause !== void 0) this.cause = cause;
	}
};
/** One sync's remote-delete gate and counters. */
var DeletePass = class {
	constructor(mode, cap, waiveWindow) {
		this.mode = mode;
		this.cap = cap;
		this.waiveWindow = waiveWindow;
		this.attempted = 0;
		this.capped = 0;
		this.suppressed = 0;
	}
	takeSlot() {
		if (this.attempted >= this.cap) {
			this.capped++;
			return false;
		}
		this.attempted++;
		return true;
	}
};
/**
* The memory stores attached to one session, materialised on disk.
*
* {@link SessionMemoryStores.download} opens a {@link LocalFileStore} at each
* attached store's directory (its `mount_path`, or a workdir fallback — see
* {@link SessionMemoryStores.download}), pulls its memories, and records each
* one's `content_sha256` as the sync baseline. Each sync
* ({@link SessionMemoryStores.syncIfDue} on the worker's cadence,
* {@link SessionMemoryStores.finish} once at the end) reconciles disk against
* server, per store and per path:
*
* - a memory changed only remotely is written to disk;
* - a file changed only locally is uploaded — an update with a
*   `content_sha256` precondition, or a create for a new file;
* - a file changed on both sides logs a warning and takes the server version;
* - a file the server refuses (too large, invalid content) is skipped —
*   warned once and retried only after the file changes; other files keep
*   syncing;
* - a file deleted locally is deleted on the server after a delay and a
*   re-check — never on the first sync that notices, and only up to a
*   per-sync cap. `syncDeletions` gates it;
* - a memory deleted on the server is deleted on disk — unless the local
*   file holds un-pushed edits: a writable store re-creates the memory
*   from the file, a read-only one keeps the file unsynced;
* - a store attached read-only pulls but never pushes.
*
* A download pulls the whole store, so it lists with content included. The
* recurring syncs instead run two phases: a content-free listing (paths and
* shas) drives the merge decisions, then only the memories actually being
* written to disk are fetched, a bounded number at a time. A sync that finds
* nothing changed moves no content at all.
*
* A file whose write to disk failed is never in the baseline, so its absence
* reads as a failed download — it is pulled again, never deleted. A write
* never re-creates a store folder that vanished mid-sync: it fails, and the
* next sync's scan finds whatever is at the path by then — nothing
* (re-downloaded) or someone else's files (left alone) — under the rules
* below.
*
* A store folder that loses its {@link MARKER_PATH} marker, is emptied,
* or vanishes is re-downloaded rather than treated as a mass local
* delete; a folder whose marker names another store is left as found —
* nothing pushed, nothing deleted.
*
* Two things about the store's directory make
* {@link SessionMemoryStores.download} refuse the session outright, with
* {@link SessionMemoryError}: a `mount_path` that is not a clean absolute
* path, and a directory already sitting at that path.
*
* {@link SessionMemoryStores.download} throws on the first store it cannot
* materialise. The syncs never throw: mid-session, one bad store or one bad
* file is logged and the rest continue. Instances are not safe for concurrent
* use. The worker builds one on its token-scoped sub-client (the memory
* endpoints reject the environment key): `syncIfDue` after each tool call,
* `finish` once at a clean end, a bounded {@link SessionMemoryStores.flushWrites}
* in every teardown, `dispose` last.
*/
var SessionMemoryStores = class {
	constructor(client, opts) {
		_SessionMemoryStores_instances.add(this);
		_SessionMemoryStores_client.set(this, void 0);
		_SessionMemoryStores_workdir.set(this, void 0);
		_SessionMemoryStores_syncIntervalMs.set(this, void 0);
		_SessionMemoryStores_syncDeletions.set(this, void 0);
		_SessionMemoryStores_log.set(this, void 0);
		_SessionMemoryStores_lastSyncAt.set(this, void 0);
		_SessionMemoryStores_finished.set(this, false);
		_SessionMemoryStores_stores.set(this, []);
		__classPrivateFieldSet(this, _SessionMemoryStores_client, client, "f");
		__classPrivateFieldSet(this, _SessionMemoryStores_workdir, opts.workdir, "f");
		__classPrivateFieldSet(this, _SessionMemoryStores_syncIntervalMs, opts.syncIntervalMs ?? 15e3, "f");
		checkMemorySyncInterval(__classPrivateFieldGet(this, _SessionMemoryStores_syncIntervalMs, "f"), "syncIntervalMs");
		__classPrivateFieldSet(this, _SessionMemoryStores_syncDeletions, opts.syncDeletions ?? "enabled", "f");
		__classPrivateFieldSet(this, _SessionMemoryStores_log, loggerFor(client), "f");
		__classPrivateFieldSet(this, _SessionMemoryStores_lastSyncAt, Date.now(), "f");
	}
	/**
	* Every attached store's root directory.
	*
	* The worker lists these as the file tools' allowed roots so a store
	* mounted outside the workdir stays reachable.
	*/
	get roots() {
		return __classPrivateFieldGet(this, _SessionMemoryStores_stores, "f").map((s) => s.files.root().path);
	}
	/**
	* Root directories of stores attached read-only.
	*
	* The file tools consult this to refuse writes into read-only stores.
	*/
	get readOnlyRoots() {
		return __classPrivateFieldGet(this, _SessionMemoryStores_stores, "f").filter((s) => s.readOnly).map((s) => s.files.root().path);
	}
	/**
	* Download every attached store's memories to disk.
	*
	* `session` arrives already fetched — one snapshot shared with the skills
	* download, so the two cannot disagree about the resources.
	*/
	async download(session) {
		for (const resource of session.resources) {
			if (resource.type !== "memory_store") continue;
			const root = __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_storeRoot).call(this, resource);
			let store;
			try {
				store = {
					memoryStoreId: resource.memory_store_id,
					files: await LocalFileStore.open(root, { utf8: true }),
					readOnly: resource.access === "read_only",
					baseline: /* @__PURE__ */ new Map(),
					refusedShas: /* @__PURE__ */ new Map(),
					pendingDeletes: /* @__PURE__ */ new Map()
				};
				if (!store.files.root().removedOnDispose) throw new SessionMemoryError(`something already exists at the memory store's path: ${root} (memory_store_id=${resource.memory_store_id}); it must not exist when the session starts`);
				try {
					await store.files.createRoot();
				} catch (e) {
					if (!isErrno(e)) throw e;
					throw new SessionMemoryError(`cannot create the memory store's folder: ${root} (memory_store_id=${resource.memory_store_id}): ${e}; the worker host must make this mount path writable`, e);
				}
				await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_stampAndPull).call(this, store);
				__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").info("downloaded memories", {
					count: store.baseline.size,
					memory_store_id: store.memoryStoreId,
					dest: store.files.root().path
				});
				__classPrivateFieldGet(this, _SessionMemoryStores_stores, "f").push(store);
			} catch (e) {
				if (store) await store.files.dispose().catch(() => {});
				if (e instanceof SessionMemoryError) throw e;
				throw new SessionMemoryError(`failed to download memory store memory_store_id=${resource.memory_store_id}: ${e}`, e);
			}
		}
		__classPrivateFieldSet(this, _SessionMemoryStores_lastSyncAt, Date.now(), "f");
	}
	/**
	* The session's last sync — skips the delete wait, so calling it twice
	* would undo the protection; it throws instead.
	*/
	async finish() {
		if (__classPrivateFieldGet(this, _SessionMemoryStores_finished, "f")) throw new AnthropicError("finish() was already called: it is the session's last sync and runs once");
		__classPrivateFieldSet(this, _SessionMemoryStores_finished, true, "f");
		await this.syncAll(true);
	}
	/** @internal — reconcile every store once; the tests' deterministic driver */
	async syncAll(final) {
		await Promise.all(__classPrivateFieldGet(this, _SessionMemoryStores_stores, "f").map((store) => __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_syncStore).call(this, store, final)));
		__classPrivateFieldSet(this, _SessionMemoryStores_lastSyncAt, Date.now(), "f");
	}
	/** Sync when `syncIntervalMs` has elapsed since the last one. Never throws. */
	async syncIfDue() {
		if (Date.now() - __classPrivateFieldGet(this, _SessionMemoryStores_lastSyncAt, "f") < __classPrivateFieldGet(this, _SessionMemoryStores_syncIntervalMs, "f")) return;
		await this.syncAll(false);
	}
	/**
	* Upload new and changed files; send no deletes and pull nothing.
	*
	* The push-only rescue pass for a session ending on an error or
	* cancel — best-effort, bounded by the caller: once `signal` aborts no
	* further upload starts, each store cut off part-way logs how many
	* changed files it had not finished uploading, and this resolves without
	* waiting for requests already in flight. Each store uploads up to
	* {@link UPLOAD_CONCURRENCY} files at a time. Skips read-only stores,
	* refused files, files the server already holds, and folders that fail
	* the marker check. Never throws.
	*/
	async flushWrites(signal) {
		await Promise.all(__classPrivateFieldGet(this, _SessionMemoryStores_stores, "f").map((store) => __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_flushStore).call(this, store, signal)));
	}
	/**
	* Remove every store directory that {@link SessionMemoryStores.download}
	* created. Pre-existing directories are left alone — that is
	* {@link FileStore.dispose}'s own rule. A folder that fails the marker
	* check is kept too — sync left it as found, so must dispose.
	*/
	async dispose() {
		for (const store of __classPrivateFieldGet(this, _SessionMemoryStores_stores, "f")) {
			const root = store.files.root();
			try {
				const scan = await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_scanMarker).call(this, store);
				if (!scan.markerOk && Object.keys(scan.files).length > 0) {
					__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn(`${scan.distrustReason}; leaving the memory store folder on disk`, {
						root: root.path,
						memory_store_id: store.memoryStoreId
					});
					continue;
				}
				await store.files.dispose();
			} catch (e) {
				if (!(e instanceof FileStoreError) && !isErrno(e)) throw e;
				__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("failed to remove the memory store folder", {
					root: store.files.root().path,
					memory_store_id: store.memoryStoreId,
					error: String(e)
				});
				continue;
			}
			if (root.removedOnDispose) __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").info("removed memory store dir", {
				dest: root.path,
				memory_store_id: store.memoryStoreId
			});
		}
	}
};
_SessionMemoryStores_client = /* @__PURE__ */ new WeakMap(), _SessionMemoryStores_workdir = /* @__PURE__ */ new WeakMap(), _SessionMemoryStores_syncIntervalMs = /* @__PURE__ */ new WeakMap(), _SessionMemoryStores_syncDeletions = /* @__PURE__ */ new WeakMap(), _SessionMemoryStores_log = /* @__PURE__ */ new WeakMap(), _SessionMemoryStores_lastSyncAt = /* @__PURE__ */ new WeakMap(), _SessionMemoryStores_finished = /* @__PURE__ */ new WeakMap(), _SessionMemoryStores_stores = /* @__PURE__ */ new WeakMap(), _SessionMemoryStores_instances = /* @__PURE__ */ new WeakSet(), _SessionMemoryStores_storeRoot = function _SessionMemoryStores_storeRoot(resource) {
	if (resource.mount_path) {
		if (!isPathLegal(resource.mount_path)) throw new SessionMemoryError(`memory store mount_path is not a clean absolute path: ${JSON.stringify(resource.mount_path)} (memory_store_id=${resource.memory_store_id})`);
		return resource.mount_path;
	}
	return path$1.join(__classPrivateFieldGet(this, _SessionMemoryStores_workdir, "f"), "memory", resource.name || resource.memory_store_id);
}, _SessionMemoryStores_scanMarker = async function _SessionMemoryStores_scanMarker(store) {
	const local = await store.files.hashtree();
	const marker = local[MARKER_PATH];
	delete local[MARKER_PATH];
	if (marker === markerSha(store.memoryStoreId)) return {
		files: local,
		markerOk: true,
		distrustReason: null
	};
	return {
		files: local,
		markerOk: false,
		distrustReason: marker !== void 0 ? "the marker file does not match this store" : "the marker file is gone"
	};
}, _SessionMemoryStores_syncStore = async function _SessionMemoryStores_syncStore(store, final) {
	try {
		const scan = await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_scanMarker).call(this, store);
		const local = scan.files;
		if (!scan.markerOk) {
			if (Object.keys(local).length > 0) {
				__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn(`${scan.distrustReason}; leaving the memory store folder as found and not syncing`, {
					root: store.files.root().path,
					memory_store_id: store.memoryStoreId
				});
				return;
			}
			await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_recover).call(this, store, "the folder or its marker is gone");
			return;
		}
		if (Object.keys(local).length === 0 && store.baseline.size > 1) {
			await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_recover).call(this, store, "every memory file is gone at once");
			return;
		}
		const remote = /* @__PURE__ */ new Map();
		for await (const [rel, item] of __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_listMemories).call(this, store.memoryStoreId)) remote.set(rel, item);
		const deletes = new DeletePass(__classPrivateFieldGet(this, _SessionMemoryStores_syncDeletions, "f"), Math.max(DELETE_CAP_FLOOR, Math.min(DELETE_CAP_CEILING, Math.floor(store.baseline.size / 4))), final);
		const pulls = [];
		const baseline = /* @__PURE__ */ new Map();
		const paths = [.../* @__PURE__ */ new Set([
			...remote.keys(),
			...Object.keys(local),
			...store.baseline.keys()
		])].sort();
		for (const rel of paths) {
			const remoteItem = remote.get(rel);
			const localSha = local[rel];
			const baseSha = store.baseline.get(rel);
			let sha;
			if (localSha === void 0 && baseSha !== void 0 && remoteItem !== void 0 && remoteItem.content_sha256 === baseSha && !store.readOnly) sha = await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_corroboratedDelete).call(this, store, rel, remoteItem, baseSha, deletes);
			else sha = await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_syncPath).call(this, store, rel, remoteItem, localSha, pulls);
			if (sha !== void 0) baseline.set(rel, sha);
		}
		store.baseline = baseline;
		await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_pullAll).call(this, store, pulls);
		if (deletes.suppressed > 0) __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").debug("remote deletes are disabled; locally deleted memories stay on the server", {
			count: deletes.suppressed,
			memory_store_id: store.memoryStoreId
		});
		if (deletes.capped > 0) __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn(`delete cap reached: ${deletes.mode === "log_only" ? "would send" : "sent"} ${deletes.attempted} deletes, held ${deletes.capped} for later syncs`, { memory_store_id: store.memoryStoreId });
	} catch (e) {
		__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("memory sync failed", {
			memory_store_id: store.memoryStoreId,
			error: String(e)
		});
	}
}, _SessionMemoryStores_flushStore = async function _SessionMemoryStores_flushStore(store, signal) {
	const dirty = /* @__PURE__ */ new Map();
	const unsent = /* @__PURE__ */ new Set();
	const push = async () => {
		if (store.readOnly) return;
		const scan = await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_scanMarker).call(this, store);
		if (!scan.markerOk) {
			__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn(`${scan.distrustReason}; not uploading anything from the memory store folder`, {
				root: store.files.root().path,
				memory_store_id: store.memoryStoreId
			});
			return;
		}
		for (const [rel, sha] of Object.entries(scan.files)) if (sha !== store.baseline.get(rel) && store.refusedShas.get(rel) !== sha) {
			dirty.set(rel, sha);
			unsent.add(rel);
		}
		if (dirty.size === 0 || signal?.aborted) return;
		const remote = /* @__PURE__ */ new Map();
		for await (const [rel, item] of __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_listMemories).call(this, store.memoryStoreId)) {
			if (signal?.aborted) return;
			remote.set(rel, item);
		}
		const uploads = [];
		for (const rel of [...dirty.keys()].sort()) {
			const localSha = dirty.get(rel);
			const baseSha = store.baseline.get(rel);
			const existing = remote.get(rel);
			if (existing !== void 0 && existing.content_sha256 === localSha) {
				store.baseline.set(rel, existing.content_sha256);
				unsent.delete(rel);
				continue;
			}
			if (existing !== void 0 && existing.content_sha256 !== baseSha) {
				__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("memory changed both locally and remotely; the flush leaves the remote version", {
					path: rel,
					memory_store_id: store.memoryStoreId
				});
				unsent.delete(rel);
				continue;
			}
			uploads.push([
				rel,
				localSha,
				existing
			]);
		}
		await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_uploadAll).call(this, store, uploads, unsent, signal);
	};
	try {
		await settledOrAborted(push(), signal);
		if (signal?.aborted && unsent.size > 0) __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn(`memory flush cut off part-way; ${unsent.size} of ${dirty.size} changed files had not finished uploading`, { memory_store_id: store.memoryStoreId });
	} catch (e) {
		__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("memory flush failed", {
			memory_store_id: store.memoryStoreId,
			error: String(e)
		});
	}
}, _SessionMemoryStores_recover = async function _SessionMemoryStores_recover(store, reason) {
	__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn(`${reason}; re-downloading the memory store folder instead of syncing`, {
		root: store.files.root().path,
		memory_store_id: store.memoryStoreId
	});
	await store.files.createRoot();
	await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_stampAndPull).call(this, store);
}, _SessionMemoryStores_stampAndPull = async function _SessionMemoryStores_stampAndPull(store) {
	store.baseline = /* @__PURE__ */ new Map();
	store.pendingDeletes.clear();
	await store.files.put(MARKER_PATH, `version ${MARKER_VERSION}\n${store.memoryStoreId}`);
	for await (const [rel, item] of __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_listMemories).call(this, store.memoryStoreId, "full")) if (await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_write).call(this, store, rel, item.content ?? "")) store.baseline.set(rel, item.content_sha256);
}, _SessionMemoryStores_syncPath = async function _SessionMemoryStores_syncPath(store, rel, remote, localSha, pulls) {
	const baseSha = store.baseline.get(rel);
	if (localSha !== void 0) store.pendingDeletes.delete(rel);
	if (!remote) {
		if (localSha === void 0) {
			store.pendingDeletes.delete(rel);
			return;
		}
		if (baseSha !== void 0) {
			if (localSha === baseSha) {
				const fresh = await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_removeLocal).call(this, store, rel, baseSha);
				if (fresh === void 0) return void 0;
				if (fresh === baseSha) return baseSha;
				localSha = fresh;
			}
			if (store.readOnly) __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("memory deleted remotely but edited locally; keeping the file, which a read-only store cannot push", {
				path: rel,
				memory_store_id: store.memoryStoreId
			});
			else if (store.refusedShas.get(rel) !== localSha) __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").info("memory deleted remotely but edited locally; re-creating it from the file", {
				path: rel,
				memory_store_id: store.memoryStoreId
			});
		}
		if (store.readOnly) return void 0;
		if (store.refusedShas.get(rel) === localSha) return void 0;
		return await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_upload).call(this, store, rel, localSha, void 0);
	}
	const remoteSha = remote.content_sha256;
	const remoteChanged = remoteSha !== baseSha;
	const locallyEdited = localSha !== void 0 && localSha !== baseSha && localSha !== remoteSha;
	const localChanged = !store.readOnly && locallyEdited;
	if (localSha === void 0 && baseSha !== void 0) {
		if (remoteChanged) {
			__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("memory deleted locally but changed remotely; restoring the remote version", {
				path: rel,
				memory_store_id: store.memoryStoreId
			});
			store.pendingDeletes.delete(rel);
			pulls.push([rel, remote]);
		}
		return baseSha;
	}
	if (remoteChanged) {
		if (localSha === remoteSha) return remoteSha;
		if (locallyEdited) __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("memory changed both locally and remotely; keeping the remote version", {
			path: rel,
			memory_store_id: store.memoryStoreId
		});
		pulls.push([rel, remote]);
		return baseSha;
	}
	if (localChanged) {
		if (store.refusedShas.get(rel) === localSha) return remoteSha;
		return await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_upload).call(this, store, rel, localSha, remote) ?? remoteSha;
	}
	return remoteSha;
}, _SessionMemoryStores_removeLocal = async function _SessionMemoryStores_removeLocal(store, rel, expectSha) {
	let freshSha;
	try {
		freshSha = await store.files.hashFile(rel);
	} catch (e) {
		if (!(e instanceof FileStoreError) && !isErrno(e)) throw e;
		return expectSha;
	}
	if (freshSha === null) return void 0;
	if (freshSha !== expectSha) return freshSha;
	try {
		await store.files.remove(rel);
	} catch (e) {
		if (!(e instanceof FileStoreError) && !isErrno(e)) throw e;
		__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("failed to remove memory deleted remotely", {
			path: rel,
			memory_store_id: store.memoryStoreId,
			error: String(e)
		});
		return expectSha;
	}
}, _SessionMemoryStores_write = async function _SessionMemoryStores_write(store, rel, content) {
	try {
		await store.files.put(rel, content);
	} catch (e) {
		if (!(e instanceof FileStoreError) && !isErrno(e)) throw e;
		__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("failed to write memory", {
			path: rel,
			memory_store_id: store.memoryStoreId,
			error: String(e)
		});
		return false;
	}
	return true;
}, _SessionMemoryStores_pullAll = async function _SessionMemoryStores_pullAll(store, pulls) {
	if (pulls.length === 0) return;
	const pullOne = async (rel, listed) => {
		let item;
		try {
			item = await __classPrivateFieldGet(this, _SessionMemoryStores_client, "f").beta.memoryStores.memories.retrieve(listed.id, {
				memory_store_id: store.memoryStoreId,
				view: "full"
			});
		} catch (e) {
			if (isStatus(e, 404)) return;
			__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("failed to fetch memory content", {
				path: rel,
				memory_store_id: store.memoryStoreId,
				error: String(e)
			});
			return;
		}
		if (await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_write).call(this, store, rel, item.content ?? "")) store.baseline.set(rel, item.content_sha256);
	};
	const queue = pulls[Symbol.iterator]();
	const worker = async () => {
		for (const [rel, listed] of queue) await pullOne(rel, listed);
	};
	await Promise.all(Array.from({ length: Math.min(FETCH_CONCURRENCY, pulls.length) }, worker));
}, _SessionMemoryStores_uploadAll = async function _SessionMemoryStores_uploadAll(store, uploads, unsent, signal) {
	const queue = uploads[Symbol.iterator]();
	const worker = async () => {
		for (const [rel, localSha, existing] of queue) {
			if (signal?.aborted) return;
			const sha = await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_upload).call(this, store, rel, localSha, existing);
			unsent.delete(rel);
			if (sha !== void 0) store.baseline.set(rel, sha);
		}
	};
	await Promise.all(Array.from({ length: Math.min(32, uploads.length) }, worker));
}, _SessionMemoryStores_listMemories = async function* _SessionMemoryStores_listMemories(memoryStoreId, view = "basic") {
	const limit = view === "basic" ? LIST_PAGE_SIZE : FULL_LIST_PAGE_SIZE;
	for await (const item of __classPrivateFieldGet(this, _SessionMemoryStores_client, "f").beta.memoryStores.memories.list(memoryStoreId, {
		view,
		limit
	})) {
		if (item.type !== "memory") continue;
		const rel = item.path.replace(/^\/+/, "");
		if (rel === ".anthropic-memory-store") {
			__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("the server listed the reserved marker path; skipping", {
				path: item.path,
				memory_store_id: memoryStoreId
			});
			continue;
		}
		yield [rel, item];
	}
}, _SessionMemoryStores_upload = async function _SessionMemoryStores_upload(store, rel, localSha, existing) {
	try {
		const data = await store.files.get(rel);
		if (data === null) return void 0;
		const content = decodeUTF8(data);
		const item = existing ? await __classPrivateFieldGet(this, _SessionMemoryStores_client, "f").beta.memoryStores.memories.update(existing.id, {
			memory_store_id: store.memoryStoreId,
			content,
			precondition: {
				type: "content_sha256",
				content_sha256: existing.content_sha256
			}
		}) : await __classPrivateFieldGet(this, _SessionMemoryStores_client, "f").beta.memoryStores.memories.create(store.memoryStoreId, {
			path: "/" + rel,
			content
		});
		store.refusedShas.delete(rel);
		return item.content_sha256;
	} catch (e) {
		if (existing && isStatus(e, 404)) return await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_upload).call(this, store, rel, localSha, void 0);
		const permanent = e instanceof FileStoreError || isStatus(e, 400) || isStatus(e, 413);
		if (existing && isStatus(e, 409)) __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("memory changed both locally and remotely; the upload was refused and the local edit loses", {
			path: rel,
			memory_store_id: store.memoryStoreId
		});
		else if (permanent && localSha !== void 0) {
			store.refusedShas.set(rel, localSha);
			__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("the server rejected this memory file, so it stays un-synced until its content changes", {
				path: rel,
				memory_store_id: store.memoryStoreId,
				rejection: String(e)
			});
		} else __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("failed to upload memory", {
			path: rel,
			memory_store_id: store.memoryStoreId,
			error: String(e)
		});
		return;
	}
}, _SessionMemoryStores_corroboratedDelete = async function _SessionMemoryStores_corroboratedDelete(store, rel, remote, baseSha, deletes) {
	if (deletes.mode === "disabled") {
		deletes.suppressed++;
		return baseSha;
	}
	let firstAbsent = store.pendingDeletes.get(rel);
	if (firstAbsent === void 0) {
		firstAbsent = Date.now();
		store.pendingDeletes.set(rel, firstAbsent);
	}
	if (!deletes.waiveWindow && Date.now() - firstAbsent < 3e4) return baseSha;
	let markerOk;
	let stillAbsent;
	try {
		markerOk = await store.files.hashFile(MARKER_PATH) === markerSha(store.memoryStoreId);
		stillAbsent = await store.files.hashFile(rel) === null;
	} catch (e) {
		if (!(e instanceof FileStoreError) && !isErrno(e)) throw e;
		markerOk = stillAbsent = false;
	}
	if (!markerOk) return baseSha;
	if (!stillAbsent) {
		store.pendingDeletes.delete(rel);
		return baseSha;
	}
	if (!deletes.takeSlot()) return baseSha;
	if (deletes.mode === "log_only") {
		__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").info("log-only: sync would delete this memory on the server", {
			path: rel,
			memory_store_id: store.memoryStoreId
		});
		return baseSha;
	}
	const sha = await __classPrivateFieldGet(this, _SessionMemoryStores_instances, "m", _SessionMemoryStores_deleteRemote).call(this, store, rel, remote, baseSha);
	if (sha === void 0) store.pendingDeletes.delete(rel);
	return sha;
}, _SessionMemoryStores_deleteRemote = async function _SessionMemoryStores_deleteRemote(store, rel, remote, baseSha) {
	try {
		await __classPrivateFieldGet(this, _SessionMemoryStores_client, "f").beta.memoryStores.memories.delete(remote.id, {
			memory_store_id: store.memoryStoreId,
			expected_content_sha256: baseSha
		});
	} catch (e) {
		if (isStatus(e, 404)) return void 0;
		if (isStatus(e, 409) || isStatus(e, 412)) __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("memory deleted locally but changed remotely; keeping the remote version", {
			path: rel,
			memory_store_id: store.memoryStoreId
		});
		else __classPrivateFieldGet(this, _SessionMemoryStores_log, "f").warn("failed to delete memory", {
			path: rel,
			memory_store_id: store.memoryStoreId,
			error: String(e)
		});
		return baseSha;
	}
	__classPrivateFieldGet(this, _SessionMemoryStores_log, "f").info("propagated local deletion", {
		path: rel,
		memory_store_id: store.memoryStoreId
	});
};
/**
* True for a thrown value shaped like a Node filesystem error. Shape-checked,
* not `instanceof Error` — fs errors can come from another realm.
*/
function isErrno(e) {
	return typeof e === "object" && e !== null && typeof e.code === "string";
}
/**
* Resolve when `p` settles, or as soon as `signal` aborts. A rejection from
* `p` before the abort propagates; one after it is dropped.
*/
async function settledOrAborted(p, signal) {
	if (!signal) {
		await p;
		return;
	}
	let onAbort;
	const aborted = new Promise((resolve) => {
		onAbort = resolve;
		if (signal.aborted) resolve();
	});
	signal.addEventListener("abort", onAbort, { once: true });
	try {
		await Promise.race([p, aborted]);
	} finally {
		signal.removeEventListener("abort", onAbort);
	}
}
//#endregion
//#region node_modules/.pnpm/@anthropic-ai+sdk@0.123.0_zod@4.4.3/node_modules/@anthropic-ai/sdk/tools/agent-toolset/node.mjs
/**
* Node implementation of the `agent_toolset_20260401` tools — `bash`, `read`,
* `write`, `edit`, `glob`, `grep` — plus the workdir/skills
* {@link AgentToolContext}.
*
* This mirrors `@anthropic-ai/sdk/tools/memory/node`: it is the explicit,
* Node-only entry point for these implementations. Importing it pulls in
* `node:child_process`, `node:fs`, etc., so it is kept separate from the rest of
* the SDK — depending on it is an opt-in.
*
* **Node 22+ is required** for this module: the `glob` tool uses the native
* `fs.glob`, added in Node 22. The rest of the SDK still supports Node 18+; only
* the agent toolset has this requirement.
*
* The result of {@link betaAgentToolset20260401} is a plain `BetaRunnableTool[]`;
* hand it to any tool runner — `client.beta.messages.toolRunner({ …, tools })`
* for the Messages API, or `client.beta.sessions.events.toolRunner({ …, tools })`
* for a managed-agents session:
*
* ```ts
* import { betaAgentToolset20260401 } from '@anthropic-ai/sdk/tools/agent-toolset/node';
*
* const tools = betaAgentToolset20260401({ workdir: '/work' });
* const tools2 = betaAgentToolset20260401({ workdir: '/work' }).filter((t) => t.name !== 'bash');
* ```
*
* Trust model: the file tools confine to `workdir` plus any `allowedRoots`
* (symlink-aware) and are safe without a sandbox; `bash` is unrestricted and
* should run inside one. See {@link AgentToolContext}.
*/
var _BashSession_instances;
var _BashSession_proc;
var _BashSession_buf;
var _BashSession_truncated;
var _BashSession_closed;
var _BashSession_waiting;
var _BashSession_append;
var _LineRangeCollector_instances;
var _LineRangeCollector_filePath;
var _LineRangeCollector_startLine;
var _LineRangeCollector_endLine;
var _LineRangeCollector_start;
var _LineRangeCollector_end;
var _LineRangeCollector_limit;
var _LineRangeCollector_line;
var _LineRangeCollector_collected;
var _LineRangeCollector_collectedBytes;
var _LineRangeCollector_collect;
var _LineRangeCollector_overLimitError;
const BASH_OUTPUT_LIMIT = 102400;
const BASH_DEFAULT_TIMEOUT_MS = 12e4;
const DEFAULT_MAX_FILE_BYTES = 262144;
const READ_STREAM_CHUNK_BYTES = 65536;
const NEWLINE = Buffer.from("\n");
const GREP_OUTPUT_LIMIT = 102400;
const GREP_MAX_LINE_LENGTH = 2e3;
const GLOB_RESULT_LIMIT = 200;
/**
* A bash command exceeded its `timeoutMs`. Carries the timeout so a caller can
* tell it apart from an abort without matching on the message text.
*/
var BashTimeoutError = class extends AnthropicError {
	constructor(timeoutMs) {
		super(`bash command timed out after ${timeoutMs}ms`);
		this.name = "BashTimeoutError";
		this.timeoutMs = timeoutMs;
	}
};
const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const fsGlob = fs.glob;
function resolveMaxBytes(configured) {
	return configured === void 0 ? DEFAULT_MAX_FILE_BYTES : configured;
}
/**
* Throw when the deprecated {@link AgentToolContext.unrestrictedPaths} was
* passed at all. Nothing else reads that property.
*/
function rejectUnrestrictedPaths(value) {
	if (value === void 0) return;
	throw new AnthropicError("The `unrestrictedPaths` option you passed to the agent toolset (AgentToolContext) is no longer supported. The toolset's file tools (read, write, edit, glob, grep) are now always confined to the working directory plus the directories listed in `allowedRoots`. Remove `unrestrictedPaths` from your context; to let the file tools reach any other directory, add it to `allowedRoots`.");
}
/**
* Returns the `agent_toolset_20260401` implementations bound to `ctx`. The
* result is a plain array of `BetaRunnableTool`; filter or extend it before
* handing it to a tool runner:
*
* ```ts
* const tools = [...betaAgentToolset20260401(ctx), myCustomTool];
* const tools = betaAgentToolset20260401(ctx).filter((t) => t.name !== 'grep');
* ```
*
* Concurrency note: `client.beta.sessions.events.toolRunner` dispatches a
* session's tool calls serially (the sessions API delivers one `agent.tool_use`
* at a time). `client.beta.messages.toolRunner` runs a turn's `tool.run` calls
* via `Promise.all`. The toolset below is safe under either model —
* {@link betaBashTool} serializes its persistent shell internally and the FS
* tools are independent per call — but {@link betaEditTool}/{@link betaWriteTool}
* cannot synchronize concurrent writes to the *same* file across processes, so a
* multi-edit turn touching one path is still subject to inherent FS lost-update
* races. Custom tools that close over mutable state should do their own queueing.
*/
function betaAgentToolset20260401(ctx) {
	return [
		betaBashTool(ctx),
		betaReadTool(ctx),
		betaWriteTool(ctx),
		betaEditTool(ctx),
		betaGlobTool(ctx),
		betaGrepTool(ctx)
	];
}
/**
* Resolve `p` against `ctx.workdir`; reject results outside `ctx.workdir` and
* `ctx.allowedRoots`. Absolute and relative inputs go through the same
* canonicalise-then-contain check — an absolute path that lands inside a
* permitted root is accepted, only paths that resolve *outside* all of them
* are rejected. Every symlink in `p` (including the leaf, even a dangling one)
* is resolved before the check, and the resolved path is what the tool then
* operates on, so a symlink inside the workdir that points outside it can
* neither pass the check nor be followed afterwards. See the trust model on
* {@link AgentToolContext}.
*
* Residual TOCTOU: a component could still be swapped for a symlink between this
* call and the eventual `fs` operation. Closing that fully needs per-component
* `O_NOFOLLOW`/`openat`, which Node does not expose ergonomically; the same
* residual exposure exists in `tools/memory/node` and is why a sandbox is still
* recommended for the toolset as a whole.
*/
async function resolvePath(ctx, p) {
	rejectUnrestrictedPaths(ctx.unrestrictedPaths);
	return confineToRoot(ctx.workdir, p, { allowedRoots: ctx.allowedRoots ?? [] });
}
/**
* The read-only root `target` falls under, or `undefined`. `target` arrives
* fully canonicalized (from {@link resolvePath}), so each root is
* canonicalized too — a root recorded through a symlinked workdir must still
* match the resolved write target.
*/
function readOnlyRootFor(ctx, target) {
	return containingRoot(ctx.readOnlyRoots ?? [], target);
}
/**
* Build the environment for the spawned bash shell. The runner process holds
* Anthropic credentials in `ANTHROPIC_*` env vars — the API key, the auth token,
* and the per-work session token among them. `bash` runs an unrestricted shell,
* so any command the agent runs could read those straight out of `process.env`;
* strip the whole `ANTHROPIC_*` namespace from the child's environment.
* Everything else (PATH, HOME, locale, …) is passed through unchanged.
*
* Passing an explicit `env` to {@link AgentToolContext} does NOT add to this
* default — it FULLY REPLACES it. The provided mapping becomes the entire bash
* environment verbatim; nothing here is merged in, so callers who want the
* scrubbed process environment plus extras must build that mapping themselves.
*/
function scrubbedShellEnv() {
	const env = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (key.startsWith("ANTHROPIC_")) continue;
		env[key] = value;
	}
	return env;
}
/**
* A persistent /bin/bash process. State (cwd, env, background jobs) survives
* across exec() calls. Uses pipes rather than a PTY so input is never echoed.
*/
var BashSession = class {
	constructor(dir, env = scrubbedShellEnv()) {
		_BashSession_instances.add(this);
		_BashSession_proc.set(this, void 0);
		_BashSession_buf.set(this, "");
		_BashSession_truncated.set(this, false);
		_BashSession_closed.set(this, false);
		_BashSession_waiting.set(this, null);
		__classPrivateFieldSet(this, _BashSession_proc, cp.spawn("/bin/bash", ["--noprofile", "--norc"], {
			cwd: dir,
			env: {
				...env,
				PS1: "",
				PS2: "",
				TERM: "dumb"
			},
			stdio: [
				"pipe",
				"pipe",
				"pipe"
			],
			detached: true
		}), "f");
		__classPrivateFieldGet(this, _BashSession_proc, "f").stdout.setEncoding("utf8");
		__classPrivateFieldGet(this, _BashSession_proc, "f").stderr.setEncoding("utf8");
		__classPrivateFieldGet(this, _BashSession_proc, "f").stdout.on("data", (d) => __classPrivateFieldGet(this, _BashSession_instances, "m", _BashSession_append).call(this, d));
		__classPrivateFieldGet(this, _BashSession_proc, "f").stderr.on("data", (d) => __classPrivateFieldGet(this, _BashSession_instances, "m", _BashSession_append).call(this, d));
		__classPrivateFieldGet(this, _BashSession_proc, "f").once("close", () => {
			__classPrivateFieldSet(this, _BashSession_closed, true, "f");
			const w = __classPrivateFieldGet(this, _BashSession_waiting, "f");
			__classPrivateFieldSet(this, _BashSession_waiting, null, "f");
			w?.resolve();
		});
	}
	/** Whether the underlying shell process has exited. */
	get closed() {
		return __classPrivateFieldGet(this, _BashSession_closed, "f");
	}
	async exec(command, opts = {}) {
		if (__classPrivateFieldGet(this, _BashSession_closed, "f")) throw new AnthropicError("bash session terminated");
		const timeoutMs = opts.timeoutMs ?? BASH_DEFAULT_TIMEOUT_MS;
		const signal = opts.signal;
		signal?.throwIfAborted();
		__classPrivateFieldSet(this, _BashSession_buf, "", "f");
		__classPrivateFieldSet(this, _BashSession_truncated, false, "f");
		const sentinel = `__ANT_CMD_${crypto.randomUUID()}_DONE__`;
		const wrapped = `{ ${command}\n} </dev/null 2>&1; printf '\\n${`${sentinel.slice(0, 8)}''${sentinel.slice(8)}`}%d\\n' $?\n`;
		__classPrivateFieldGet(this, _BashSession_proc, "f").stdin.write(wrapped);
		if (__classPrivateFieldGet(this, _BashSession_buf, "f").indexOf(sentinel) < 0) {
			const { promise: sentinelSeen, resolve } = promiseWithResolvers();
			__classPrivateFieldSet(this, _BashSession_waiting, {
				sentinel,
				resolve
			}, "f");
			let timer;
			let onAbort;
			try {
				await Promise.race([
					sentinelSeen,
					new Promise((_, reject) => {
						timer = setTimeout(() => reject(new BashTimeoutError(timeoutMs)), timeoutMs);
					}),
					new Promise((_, reject) => {
						if (!signal) return;
						onAbort = () => reject(signal.reason);
						signal.addEventListener("abort", onAbort, { once: true });
					})
				]);
			} finally {
				if (timer) clearTimeout(timer);
				if (onAbort && signal) signal.removeEventListener("abort", onAbort);
				__classPrivateFieldSet(this, _BashSession_waiting, null, "f");
			}
		}
		const idx = __classPrivateFieldGet(this, _BashSession_buf, "f").indexOf(sentinel);
		if (idx < 0) throw new AnthropicError("bash session terminated");
		const m = __classPrivateFieldGet(this, _BashSession_buf, "f").slice(idx + sentinel.length).match(/^(-?\d+)/);
		const exitCode = m ? parseInt(m[1], 10) : -1;
		let out = __classPrivateFieldGet(this, _BashSession_buf, "f").slice(0, idx).replace(ANSI_RE, "").replace(/\n+$/, "");
		if (__classPrivateFieldGet(this, _BashSession_truncated, "f")) out = `[output truncated]\n${out}`;
		return {
			output: out,
			exitCode
		};
	}
	close() {
		if (__classPrivateFieldGet(this, _BashSession_closed, "f")) return;
		__classPrivateFieldSet(this, _BashSession_closed, true, "f");
		const w = __classPrivateFieldGet(this, _BashSession_waiting, "f");
		__classPrivateFieldSet(this, _BashSession_waiting, null, "f");
		w?.resolve();
		__classPrivateFieldGet(this, _BashSession_proc, "f").stdout.destroy();
		__classPrivateFieldGet(this, _BashSession_proc, "f").stderr.destroy();
		__classPrivateFieldGet(this, _BashSession_proc, "f").stdin.destroy();
		try {
			process.kill(-__classPrivateFieldGet(this, _BashSession_proc, "f").pid, "SIGKILL");
		} catch {
			__classPrivateFieldGet(this, _BashSession_proc, "f").kill("SIGKILL");
		}
		__classPrivateFieldGet(this, _BashSession_proc, "f").unref();
	}
};
_BashSession_proc = /* @__PURE__ */ new WeakMap(), _BashSession_buf = /* @__PURE__ */ new WeakMap(), _BashSession_truncated = /* @__PURE__ */ new WeakMap(), _BashSession_closed = /* @__PURE__ */ new WeakMap(), _BashSession_waiting = /* @__PURE__ */ new WeakMap(), _BashSession_instances = /* @__PURE__ */ new WeakSet(), _BashSession_append = function _BashSession_append(d) {
	__classPrivateFieldSet(this, _BashSession_buf, __classPrivateFieldGet(this, _BashSession_buf, "f") + d, "f");
	if (__classPrivateFieldGet(this, _BashSession_buf, "f").length > BASH_OUTPUT_LIMIT) {
		__classPrivateFieldSet(this, _BashSession_buf, __classPrivateFieldGet(this, _BashSession_buf, "f").slice(__classPrivateFieldGet(this, _BashSession_buf, "f").length - BASH_OUTPUT_LIMIT), "f");
		__classPrivateFieldSet(this, _BashSession_truncated, true, "f");
	}
	if (__classPrivateFieldGet(this, _BashSession_waiting, "f") && __classPrivateFieldGet(this, _BashSession_buf, "f").indexOf(__classPrivateFieldGet(this, _BashSession_waiting, "f").sentinel) >= 0) {
		const w = __classPrivateFieldGet(this, _BashSession_waiting, "f");
		__classPrivateFieldSet(this, _BashSession_waiting, null, "f");
		w.resolve();
	}
};
function betaBashTool(ctx) {
	rejectUnrestrictedPaths(ctx.unrestrictedPaths);
	let session;
	let tail = Promise.resolve();
	return betaTool({
		name: "bash",
		description: "Run a bash command in a persistent shell. State (cwd, env vars) persists across calls.",
		inputSchema: {
			type: "object",
			properties: {
				command: {
					type: "string",
					description: "The command to run"
				},
				restart: {
					type: "boolean",
					description: "Restart the persistent shell before running"
				},
				timeout_ms: {
					type: "integer",
					description: "Per-call timeout in milliseconds"
				}
			}
		},
		run: async ({ command, restart, timeout_ms }, context) => {
			const prev = tail;
			const gate = promiseWithResolvers();
			tail = gate.promise;
			try {
				await prev;
			} catch {}
			try {
				if (restart) {
					session?.close();
					session = void 0;
				}
				if (!command) {
					if (restart) return "bash session restarted";
					throw new ToolError("bash: command is required");
				}
				session ?? (session = new BashSession(ctx.workdir, ctx.env));
				try {
					const { output, exitCode } = await session.exec(command, {
						timeoutMs: timeout_ms ?? BASH_DEFAULT_TIMEOUT_MS,
						signal: context?.signal
					});
					if (exitCode !== 0) throw new ToolError(output || `exit ${exitCode}`);
					return output;
				} catch (e) {
					if (e instanceof ToolError) throw e;
					session.close();
					session = void 0;
					throw new ToolError(`bash: ${e instanceof Error ? e.message : String(e)}`);
				}
			} finally {
				gate.resolve();
			}
		},
		close: () => {
			session?.close();
			session = void 0;
		}
	});
}
function betaReadTool(ctx) {
	rejectUnrestrictedPaths(ctx.unrestrictedPaths);
	return betaTool({
		name: "read",
		description: "Read a UTF-8 text file relative to the workdir.",
		inputSchema: {
			type: "object",
			properties: {
				file_path: { type: "string" },
				view_range: {
					type: "array",
					items: { type: "integer" },
					description: "[start_line, end_line] 1-indexed inclusive"
				}
			},
			required: ["file_path"]
		},
		run: async ({ file_path, view_range }) => {
			if (!file_path) throw new ToolError("read: file_path is required");
			const abs = await resolvePath(ctx, file_path);
			if (view_range?.length && view_range.length !== 2) throw new ToolError("read: view_range must be [start_line, end_line]");
			let data;
			try {
				const st = await fs.stat(abs);
				if (!st.isFile()) throw new ToolError(`read: ${file_path} is not a regular file`);
				const limit = resolveMaxBytes(ctx.maxFileBytes);
				if (limit !== null && st.size > limit) {
					if (!view_range?.length) throw new ToolError(`read: ${file_path} is ${st.size} bytes, exceeds ${limit}-byte limit. Use the view_range parameter to read specific line ranges, e.g. view_range: [1, 500].`);
					const [startLine, endLine] = view_range;
					return await readRangeStreaming(abs, file_path, startLine, endLine, limit);
				}
				data = await fs.readFile(abs, "utf8");
			} catch (e) {
				if (e instanceof ToolError) throw e;
				throw new ToolError(`read: ${fsErrorMessage(e, file_path)}`);
			}
			if (!view_range?.length) return data;
			const [startLine, endLine] = view_range;
			const lines = data.split("\n");
			const start = Math.max(0, startLine - 1);
			const end = endLine > 0 ? endLine : lines.length;
			return lines.slice(start, end).join("\n");
		}
	});
}
/** Returns lines `[startLine, endLine]` of the file at `abs`, capping the selected bytes at `limit`. */
async function readRangeStreaming(abs, filePath, startLine, endLine, limit) {
	const lines = new LineRangeCollector(filePath, startLine, endLine, limit);
	if (lines.rangeIsEmpty()) return "";
	const stream = fssync.createReadStream(abs, { highWaterMark: READ_STREAM_CHUNK_BYTES });
	try {
		for await (const chunk of stream) {
			lines.collectFrom(chunk);
			if (lines.rangeIsCollected()) break;
		}
	} finally {
		stream.destroy();
	}
	return lines.text();
}
/** Collects the bytes of lines `[startLine, endLine]` from consecutive file chunks, capped at `limit`. */
var LineRangeCollector = class {
	constructor(filePath, startLine, endLine, limit) {
		_LineRangeCollector_instances.add(this);
		_LineRangeCollector_filePath.set(this, void 0);
		_LineRangeCollector_startLine.set(this, void 0);
		_LineRangeCollector_endLine.set(this, void 0);
		_LineRangeCollector_start.set(this, void 0);
		_LineRangeCollector_end.set(this, void 0);
		_LineRangeCollector_limit.set(this, void 0);
		_LineRangeCollector_line.set(this, 0);
		_LineRangeCollector_collected.set(this, []);
		_LineRangeCollector_collectedBytes.set(this, 0);
		__classPrivateFieldSet(this, _LineRangeCollector_filePath, filePath, "f");
		__classPrivateFieldSet(this, _LineRangeCollector_startLine, startLine, "f");
		__classPrivateFieldSet(this, _LineRangeCollector_endLine, endLine, "f");
		__classPrivateFieldSet(this, _LineRangeCollector_start, Math.max(0, startLine - 1), "f");
		__classPrivateFieldSet(this, _LineRangeCollector_end, endLine > 0 ? endLine : Infinity, "f");
		__classPrivateFieldSet(this, _LineRangeCollector_limit, limit, "f");
	}
	rangeIsEmpty() {
		return __classPrivateFieldGet(this, _LineRangeCollector_end, "f") <= __classPrivateFieldGet(this, _LineRangeCollector_start, "f");
	}
	rangeIsCollected() {
		return __classPrivateFieldGet(this, _LineRangeCollector_line, "f") >= __classPrivateFieldGet(this, _LineRangeCollector_end, "f");
	}
	collectFrom(chunk) {
		var _a;
		let lineStart = 0;
		while (lineStart < chunk.length && !this.rangeIsCollected()) {
			const newline = chunk.indexOf(10, lineStart);
			const lineEnd = newline < 0 ? chunk.length : newline;
			if (__classPrivateFieldGet(this, _LineRangeCollector_line, "f") >= __classPrivateFieldGet(this, _LineRangeCollector_start, "f")) __classPrivateFieldGet(this, _LineRangeCollector_instances, "m", _LineRangeCollector_collect).call(this, chunk.subarray(lineStart, lineEnd), newline >= 0);
			if (newline < 0) break;
			__classPrivateFieldSet(this, _LineRangeCollector_line, (_a = __classPrivateFieldGet(this, _LineRangeCollector_line, "f"), _a++, _a), "f");
			lineStart = newline + 1;
		}
	}
	text() {
		return Buffer.concat(__classPrivateFieldGet(this, _LineRangeCollector_collected, "f"), __classPrivateFieldGet(this, _LineRangeCollector_collectedBytes, "f")).toString("utf8");
	}
};
_LineRangeCollector_filePath = /* @__PURE__ */ new WeakMap(), _LineRangeCollector_startLine = /* @__PURE__ */ new WeakMap(), _LineRangeCollector_endLine = /* @__PURE__ */ new WeakMap(), _LineRangeCollector_start = /* @__PURE__ */ new WeakMap(), _LineRangeCollector_end = /* @__PURE__ */ new WeakMap(), _LineRangeCollector_limit = /* @__PURE__ */ new WeakMap(), _LineRangeCollector_line = /* @__PURE__ */ new WeakMap(), _LineRangeCollector_collected = /* @__PURE__ */ new WeakMap(), _LineRangeCollector_collectedBytes = /* @__PURE__ */ new WeakMap(), _LineRangeCollector_instances = /* @__PURE__ */ new WeakSet(), _LineRangeCollector_collect = function _LineRangeCollector_collect(lineBytes, newlineTerminated) {
	__classPrivateFieldGet(this, _LineRangeCollector_collected, "f").push(lineBytes);
	__classPrivateFieldSet(this, _LineRangeCollector_collectedBytes, __classPrivateFieldGet(this, _LineRangeCollector_collectedBytes, "f") + lineBytes.length, "f");
	if (newlineTerminated && __classPrivateFieldGet(this, _LineRangeCollector_line, "f") + 1 < __classPrivateFieldGet(this, _LineRangeCollector_end, "f")) {
		__classPrivateFieldGet(this, _LineRangeCollector_collected, "f").push(NEWLINE);
		__classPrivateFieldSet(this, _LineRangeCollector_collectedBytes, __classPrivateFieldGet(this, _LineRangeCollector_collectedBytes, "f") + NEWLINE.length, "f");
	}
	if (__classPrivateFieldGet(this, _LineRangeCollector_collectedBytes, "f") > __classPrivateFieldGet(this, _LineRangeCollector_limit, "f")) throw __classPrivateFieldGet(this, _LineRangeCollector_instances, "m", _LineRangeCollector_overLimitError).call(this);
}, _LineRangeCollector_overLimitError = function _LineRangeCollector_overLimitError() {
	if (__classPrivateFieldGet(this, _LineRangeCollector_end, "f") - __classPrivateFieldGet(this, _LineRangeCollector_start, "f") === 1) return new ToolError(`read: line ${__classPrivateFieldGet(this, _LineRangeCollector_start, "f") + 1} of ${__classPrivateFieldGet(this, _LineRangeCollector_filePath, "f")} alone exceeds ${__classPrivateFieldGet(this, _LineRangeCollector_limit, "f")}-byte limit. The read tool cannot return part of a line, so view_range cannot narrow this further.`);
	return new ToolError(`read: view_range [${__classPrivateFieldGet(this, _LineRangeCollector_startLine, "f")}, ${__classPrivateFieldGet(this, _LineRangeCollector_endLine, "f")}] of ${__classPrivateFieldGet(this, _LineRangeCollector_filePath, "f")} exceeds ${__classPrivateFieldGet(this, _LineRangeCollector_limit, "f")}-byte limit. Narrow the view_range to read a smaller portion.`);
};
function betaWriteTool(ctx) {
	rejectUnrestrictedPaths(ctx.unrestrictedPaths);
	return betaTool({
		name: "write",
		description: "Write a UTF-8 text file relative to the workdir, creating parent directories as needed.",
		inputSchema: {
			type: "object",
			properties: {
				file_path: { type: "string" },
				content: { type: "string" }
			},
			required: ["file_path", "content"]
		},
		run: async ({ file_path, content }) => {
			if (!file_path) throw new ToolError("write: file_path is required");
			const abs = await resolvePath(ctx, file_path);
			const ro = await readOnlyRootFor(ctx, abs);
			if (ro !== void 0) throw new ToolError(`write: ${file_path} is inside read-only directory ${ro}`);
			try {
				await fs.mkdir(path.dirname(abs), {
					recursive: true,
					mode: 493
				});
				await atomicWriteFile(abs, content ?? "");
			} catch (e) {
				throw new ToolError(`write: ${fsErrorMessage(e, file_path)}`);
			}
			return `wrote ${Buffer.byteLength(content ?? "")} bytes to ${file_path}`;
		}
	});
}
function betaEditTool(ctx) {
	rejectUnrestrictedPaths(ctx.unrestrictedPaths);
	return betaTool({
		name: "edit",
		description: "Replace old_string with new_string in a file. old_string must be unique unless replace_all.",
		inputSchema: {
			type: "object",
			properties: {
				file_path: { type: "string" },
				old_string: { type: "string" },
				new_string: { type: "string" },
				replace_all: { type: "boolean" }
			},
			required: [
				"file_path",
				"old_string",
				"new_string"
			]
		},
		run: async ({ file_path, old_string, new_string, replace_all }) => {
			if (!file_path) throw new ToolError("edit: file_path is required");
			if (!old_string) throw new ToolError("edit: old_string is required");
			const abs = await resolvePath(ctx, file_path);
			const ro = await readOnlyRootFor(ctx, abs);
			if (ro !== void 0) throw new ToolError(`edit: ${file_path} is inside read-only directory ${ro}`);
			let data;
			try {
				const st = await fs.stat(abs);
				if (!st.isFile()) throw new ToolError(`edit: ${file_path} is not a regular file`);
				const limit = resolveMaxBytes(ctx.maxFileBytes);
				if (limit !== null && st.size > limit) throw new ToolError(`edit: ${file_path} is ${st.size} bytes, exceeds ${limit}-byte limit. The edit tool loads the whole file and cannot modify a file this large.`);
				data = await fs.readFile(abs, "utf8");
			} catch (e) {
				if (e instanceof ToolError) throw e;
				throw new ToolError(`edit: ${fsErrorMessage(e, file_path)}`);
			}
			const count = data.split(old_string).length - 1;
			if (count === 0) throw new ToolError(`edit: old_string not found in ${file_path}`);
			let updated;
			if (replace_all) updated = data.split(old_string).join(new_string);
			else {
				if (count > 1) throw new ToolError(`edit: old_string appears ${count} times in ${file_path} (must be unique)`);
				updated = data.replace(old_string, () => new_string);
			}
			try {
				await atomicWriteFile(abs, updated);
			} catch (e) {
				throw new ToolError(`edit: write: ${fsErrorMessage(e, file_path)}`);
			}
			return `edited ${file_path} (${replace_all ? count : 1} replacement(s))`;
		}
	});
}
/**
* Best-effort: stops `fs.glob` from walking out of the root via a literal or
* brace-expanded `..`. The realpath post-filter in {@link betaGlobTool} is the
* boundary; this only avoids the walk.
*/
function patternCanAscend(pattern) {
	return pattern.split(/[\\/{},]/).includes("..");
}
function betaGlobTool(ctx) {
	rejectUnrestrictedPaths(ctx.unrestrictedPaths);
	return betaTool({
		name: "glob",
		description: "Match files under the workdir against a glob pattern. Results are mtime-sorted, newest first.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string" },
				path: {
					type: "string",
					description: "Directory to search in. Defaults to the workdir."
				}
			},
			required: ["pattern"]
		},
		run: async ({ pattern, path: searchPath }) => {
			if (!pattern) throw new ToolError("glob: pattern is required");
			if (path.isAbsolute(pattern)) throw new ToolError("glob: absolute pattern not permitted; pass a relative pattern (and optionally path)");
			if (patternCanAscend(pattern)) throw new ToolError("glob: \"..\" is not permitted in the pattern");
			const root = searchPath ? await resolvePath(ctx, searchPath) : path.resolve(ctx.workdir);
			const realRoot = searchPath ? root : await canonicalize(root);
			const matches = [];
			let remaining = WALK_MAX_ENTRIES;
			try {
				for await (const entry of fsGlob(pattern, {
					cwd: root,
					withFileTypes: true,
					exclude: (d) => d.name === ".git" || d.name === "node_modules"
				})) {
					if (remaining-- <= 0) break;
					if (!entry.isFile()) continue;
					const full = path.join(entry.parentPath, entry.name);
					let real;
					try {
						real = await fs.realpath(full);
					} catch {
						continue;
					}
					if (!isWithin(realRoot, real)) continue;
					let mtime = 0;
					try {
						mtime = (await fs.stat(full)).mtimeMs;
					} catch {}
					matches.push({
						path: full,
						mtime
					});
				}
			} catch (e) {
				throw new ToolError(`glob: ${e instanceof Error ? e.message : String(e)}`);
			}
			if (matches.length === 0) return "no matches";
			matches.sort((a, b) => b.mtime - a.mtime);
			return matches.slice(0, GLOB_RESULT_LIMIT).map((m) => m.path).join("\n");
		}
	});
}
function betaGrepTool(ctx) {
	rejectUnrestrictedPaths(ctx.unrestrictedPaths);
	return betaTool({
		name: "grep",
		description: "Search file contents for a regex. Uses ripgrep if available, otherwise a built-in walker.",
		inputSchema: {
			type: "object",
			properties: {
				pattern: { type: "string" },
				path: { type: "string" }
			},
			required: ["pattern"]
		},
		run: async ({ pattern, path: p }, context) => {
			if (!pattern) throw new ToolError("grep: pattern is required");
			let searchPath = path.resolve(ctx.workdir);
			if (p) searchPath = await resolvePath(ctx, p);
			const rg = await findRg();
			return rg ? runRipgrep(rg, pattern, searchPath, context?.signal) : runWalkGrep(pattern, searchPath, context?.signal);
		}
	});
}
function runRipgrep(rg, pattern, searchPath, signal) {
	return new Promise((resolve, reject) => {
		const proc = cp.spawn(rg, [
			"-n",
			"--no-heading",
			"-e",
			pattern,
			"--",
			searchPath
		], { ...signal ? { signal } : {} });
		let out = "";
		let errOut = "";
		let truncated = false;
		proc.stdout.on("data", (d) => {
			if (truncated) return;
			out += d;
			if (out.length > GREP_OUTPUT_LIMIT) {
				truncated = true;
				out = out.slice(0, GREP_OUTPUT_LIMIT);
				proc.kill("SIGKILL");
			}
		});
		proc.stderr.on("data", (d) => errOut += d);
		proc.on("close", (code) => {
			if (signal?.aborted) return reject(new ToolError("grep: aborted"));
			if (truncated) return resolve(out + `\n[output truncated at ${GREP_OUTPUT_LIMIT} bytes]`);
			if (code === 0) return resolve(out);
			if (code === 1) return resolve("no matches");
			reject(new ToolError(`grep: rg failed: ${errOut || `exit ${code}`}`));
		});
		proc.on("error", (e) => {
			if (signal?.aborted) return reject(new ToolError("grep: aborted"));
			reject(new ToolError(`grep: rg failed: ${e.message}`));
		});
	});
}
async function runWalkGrep(pattern, root, signal) {
	let re;
	try {
		re = new RegExp(pattern);
	} catch (e) {
		throw new ToolError(`grep: invalid regex: ${e instanceof Error ? e.message : String(e)}`);
	}
	const hits = [];
	let budget = GREP_OUTPUT_LIMIT;
	const push = (line) => {
		budget -= line.length + 1;
		if (budget < 0) {
			hits.push(`[output truncated at ${GREP_OUTPUT_LIMIT} bytes]`);
			return false;
		}
		hits.push(line);
		return true;
	};
	if ((await fs.stat(root).catch(() => null))?.isFile()) await grepFile(root, re, push);
	else await walk(root, "", (rel) => grepFile(path.join(root, rel), re, push), signal);
	if (signal?.aborted) throw new ToolError("grep: aborted");
	if (hits.length === 0) return "no matches";
	return hits.join("\n");
}
async function grepFile(file, re, push) {
	const stream = fssync.createReadStream(file, { encoding: "utf8" });
	const rl = readline.createInterface({
		input: stream,
		crlfDelay: Infinity
	});
	let i = 0;
	try {
		for await (const line of rl) {
			i++;
			if (line.length > GREP_MAX_LINE_LENGTH) continue;
			if (re.test(line) && !push(`${file}:${i}:${line}`)) return false;
		}
	} catch {} finally {
		stream.destroy();
	}
	return true;
}
const WALK_MAX_DEPTH = 40;
const WALK_MAX_ENTRIES = 5e4;
/**
* Bounded recursive walk. `fn` may return `false` to abort. Only real
* directories are descended into and only real files are handed to `fn` —
* symlinks (and devices/fifos/sockets) are skipped entirely so a symlink inside
* the root cannot be followed out of it.
*/
async function walk(root, rel, fn, signal) {
	let remaining = WALK_MAX_ENTRIES;
	async function inner(rel, depth) {
		if (depth > WALK_MAX_DEPTH) return true;
		if (signal?.aborted) return false;
		let entries;
		try {
			entries = await fs.readdir(path.join(root, rel), { withFileTypes: true });
		} catch {
			return true;
		}
		for (const e of entries) {
			if (e.name === ".git" || e.name === "node_modules") continue;
			if (remaining-- <= 0) return false;
			if (signal?.aborted) return false;
			const childRel = rel ? path.join(rel, e.name) : e.name;
			if (e.isDirectory()) {
				if (!await inner(childRel, depth + 1)) return false;
			} else if (e.isFile()) {
				if (await fn(childRel) === false) return false;
			}
		}
		return true;
	}
	await inner(rel, 0);
}
async function findRg() {
	const dirs = (process.env["PATH"] ?? "").split(path.delimiter);
	for (const d of dirs) {
		const candidate = path.join(d, "rg");
		try {
			await fs.access(candidate, fssync.constants.X_OK);
			return candidate;
		} catch {}
	}
	return null;
}
//#endregion
export { MEMORY_FLUSH_TIMEOUT_MS, SessionMemoryError, SessionMemoryStores, betaAgentToolset20260401, setupSkills };
