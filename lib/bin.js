#!/usr/bin/env node
import { c as lazyApi, d as __require, i as createProvider, r as createModels } from "./models-DV5vWzMC.js";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { constants, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, parse, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { link, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { Buffer as Buffer$1 } from "node:buffer";
import { constants as constants$1, zstdCompressSync, zstdDecompressSync } from "node:zlib";
//#region node_modules/.pnpm/@deepseek-ai+dsh-atomic-write@0.1.7-rc.1_@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/dsh-atomic-write/lib/index.js
/**
* Zero-dependency atomic file replacement and writer coordination.
* `writeFileAtomic` writes a random-suffix sibling with exclusive create and
* the caller's permission bits, then renames it over the target, so readers
* observe either the old or the new complete content and a replaced file ends
* up with exactly the stated mode. `withFileLock` serializes cross-process
* writers of one file through a `wx`-created `<file>.lock` sibling, so a
* read-modify-write cycle can never resurrect a state another writer just
* replaced; readers stay lock-free because the rename commit is atomic.
* @module @deepseek-ai/dsh-atomic-write
*/
const WINDOWS_TRANSIENT_RENAME_ERRORS = /* @__PURE__ */ new Set([
	"EACCES",
	"EBUSY",
	"EPERM"
]);
const WINDOWS_RENAME_RETRY_INITIAL_MS = 20;
const WINDOWS_RENAME_RETRY_MAX_MS = 200;
const WINDOWS_RENAME_RETRY_LIMIT = 8;
/** Whether Windows reported temporary interference with an atomic replacement. */
function isTransientWindowsRenameError(error) {
	if (process.platform !== "win32") return false;
	return WINDOWS_TRANSIENT_RENAME_ERRORS.has(error?.code ?? "");
}
/** Replace the target after bounded retries for transient Windows interference. */
async function renameAtomicTemp(temp, filename) {
	let delay = WINDOWS_RENAME_RETRY_INITIAL_MS;
	for (let retries = 0;; retries += 1) {
		try {
			await rename(temp, filename);
			return;
		} catch (error) {
			if (!isTransientWindowsRenameError(error)) throw error;
			if (retries >= WINDOWS_RENAME_RETRY_LIMIT) throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, delay));
		delay = Math.min(delay * 2, WINDOWS_RENAME_RETRY_MAX_MS);
	}
}
/**
* Replace `filename` with `content` in one atomic step, creating parent
* directories. The content is first written to a random-suffix sibling opened
* with exclusive create (`wx`): the open refuses to follow a symlink planted
* at the temp path, and the fresh inode carries `options.mode` through the
* rename, so replacing a wider-permission file narrows it without a chmod
* race. The rename also replaces a symlinked target itself instead of writing
* through to its referent, and the same-directory sibling keeps the rename on
* one filesystem. Windows replacement retries transient `EACCES`, `EBUSY`,
* and `EPERM` failures for a bounded interval while the complete temp file
* remains the rename source. On any remaining failure the temp file is
* removed and the failure rethrown. Crash durability (fsync) is out of scope.
* @param filename - final path receiving the content.
* @param content - complete next file content.
* @param options - permission bits for the replacement inode.
*/
async function writeFileAtomic(filename, content, options) {
	await mkdir(dirname(filename), {
		recursive: true,
		...options.dirMode === void 0 ? {} : { mode: options.dirMode }
	});
	const temp = `${filename}.${randomBytes(6).toString("hex")}.tmp`;
	try {
		await writeFile(temp, content, {
			mode: options.mode,
			flag: "wx"
		});
		await renameAtomicTemp(temp, filename);
	} catch (error) {
		await rm(temp, { force: true });
		throw error;
	}
}
/** Whether an exclusive create found an existing lock. */
async function isLockContention(error, lockPath) {
	const code = error?.code;
	if (code === "EEXIST") return true;
	if (code !== "EPERM") return false;
	try {
		await lstat(lockPath);
		return true;
	} catch {
		return false;
	}
}
/**
* Retry cadence for a contended lock. These stay robustness invariants of the
* cross-process write protocol rather than deployment tunables: they govern how
* often a contender asks, which no caller has a reason to vary.
*/
const LOCK_RETRY_INITIAL_MS = 20;
const LOCK_RETRY_MAX_MS = 200;
/**
* How long a contender waits when the caller states no limit — sized for the
* render-and-rename cycle every call site had when this package was written.
* Expiry fails the contender rather than guessing whether the existing lock
* still has an owner. How long is *worth* waiting is a property of the
* operation the lock holder runs, which is why {@link FileLockOptions.waitMs}
* exists; the value here is the floor for an operation that does file work
* alone.
*/
const DEFAULT_LOCK_WAIT_MS = 2e3;
/**
* Hold the cross-process writer lock for `filename` around one operation. The
* lock is a `wx`-created sibling (`<filename>.lock`); paired with the
* rename-based commit of {@link writeFileAtomic}, readers stay lock-free and
* only writers contend. `EEXIST` is contention directly; an `EPERM` is
* contention only when a fresh `lstat` confirms the lock path exists, covering
* Windows exclusive-create behavior. Windows retries one unconfirmed EPERM
* because the holder can release before the probe; a repeated unconfirmed
* permission error is rethrown. Contention backs off exponentially and times out
* after the deadline. The contender never removes an existing lock because
* file age cannot prove that its owner stopped; orphan recovery is an operator
* action. The parent directory must exist.
* @param filename - the file whose writers this lock serializes.
* @param operation - the read-render-commit cycle to run while holding the lock.
* @param options - acquisition options; omitted waits {@link DEFAULT_LOCK_WAIT_MS}.
* @returns the operation's result; the lock releases on both outcomes.
*/
async function withFileLock(filename, operation, options) {
	const lockPath = `${filename}.lock`;
	const deadline = Date.now() + (options?.waitMs ?? DEFAULT_LOCK_WAIT_MS);
	let delay = LOCK_RETRY_INITIAL_MS;
	let retriedUnconfirmedPermissionError = false;
	for (;;) {
		try {
			await writeFile(lockPath, `${process.pid}\n`, {
				mode: 384,
				flag: "wx"
			});
			break;
		} catch (error) {
			if (!await isLockContention(error, lockPath)) {
				if (process.platform !== "win32" || error?.code !== "EPERM" || retriedUnconfirmedPermissionError) throw error;
				retriedUnconfirmedPermissionError = true;
			}
		}
		if (Date.now() >= deadline) throw new Error(`atomic-write: timed out waiting for the writer lock at ${lockPath}`);
		await new Promise((resolve) => setTimeout(resolve, delay));
		delay = Math.min(delay * 2, LOCK_RETRY_MAX_MS);
	}
	try {
		return await operation();
	} finally {
		await rm(lockPath, { force: true });
	}
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-home-paths@0.1.7-rc.1_@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/dsh-home-paths/lib/index.js
/**
* Shared filesystem path helpers for DeepSeek Harness user data.
*
* @module @deepseek-ai/dsh-home-paths
*/
/** Directory name for the default DeepSeek Harness home under the OS home. */
const DSH_HOME_DIR_NAME = ".dsh";
/** Environment variable that overrides the default DeepSeek Harness home. */
const DSH_HOME_ENV = "DSH_HOME";
/**
* Resolve the default DeepSeek Harness home using Node's platform path rules.
* @returns the absolute default harness home path.
*/
function defaultDshHome() {
	return join(homedir(), DSH_HOME_DIR_NAME);
}
/**
* Expand supported tilde prefixes against the operating-system home.
* @param path - configured path that may begin with `~`, `~/`, or `~\`.
* @returns the expanded path, or the original value when no supported prefix is present.
*/
function expandHomePath(path) {
	if (path === "~") return homedir();
	if (path.startsWith("~/") || path.startsWith("~\\")) return join(homedir(), path.slice(2));
	return path;
}
/**
* Resolve the single-root DeepSeek Harness home.
*
* Precedence, highest first: an explicit configured path, `$DSH_HOME`, then
* `~/.dsh`. The harness keeps all user data under one root. An empty or
* whitespace-only `$DSH_HOME` is treated as unset, so a blank override never
* resolves the home to the current working directory.
* @param configured - explicit harness-home override, which has highest precedence.
* @param env - environment mapping used to read `DSH_HOME`.
* @returns the normalized absolute harness home path.
*/
function resolveDshHome(configured, env = process.env) {
	const fromEnv = env[DSH_HOME_ENV];
	return resolve(expandHomePath(configured ?? (fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : defaultDshHome())));
}
//#endregion
//#region src/account-profile.ts
/** Safe browser labels derived locally from OpenAI Codex OAuth credentials. */
const PROFILE_CLAIM = "https://api.openai.com/profile";
const MAX_JWT_PAYLOAD_LENGTH = 65536;
const MAX_LABEL_LENGTH = 128;
const MAX_EMAIL_LENGTH = 320;
function boundedText(value, maximum) {
	if (typeof value !== "string") return void 0;
	const normalized = value.replace(/[\u0000-\u001f\u007f]/gu, "").trim();
	return normalized.length > 0 && normalized.length <= maximum ? normalized : void 0;
}
function maskEmail(email) {
	const separator = email.lastIndexOf("@");
	if (separator <= 0 || separator === email.length - 1) return "••••";
	const local = email.slice(0, separator);
	const domain = email.slice(separator + 1);
	return `${local.slice(0, Math.min(2, local.length))}••@${domain}`;
}
function decodeOauthProfile(access) {
	const payload = access.split(".")[1];
	if (payload === void 0 || payload.length === 0 || payload.length > MAX_JWT_PAYLOAD_LENGTH) return {};
	try {
		const decoded = JSON.parse(Buffer$1.from(payload, "base64url").toString("utf8"));
		if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) return {};
		const profile = decoded[PROFILE_CLAIM];
		if (typeof profile !== "object" || profile === null || Array.isArray(profile)) return {};
		const record = profile;
		const name = boundedText(record["name"], MAX_LABEL_LENGTH);
		const email = boundedText(record["email"], MAX_EMAIL_LENGTH);
		return {
			...name === void 0 ? {} : { name },
			...email === void 0 ? {} : { email }
		};
	} catch {
		return {};
	}
}
/** Resolve display-only labels without network access or provider account identifiers. */
function resolveOpenAICodexAccountProfiles(credentials) {
	return credentials.map((credential, index) => {
		const oauth = decodeOauthProfile(credential.access);
		return {
			displayName: oauth.name ?? `ChatGPT account ${String(index + 1)}`,
			...oauth.email === void 0 ? {} : { maskedEmail: maskEmail(oauth.email) },
			source: oauth.name === void 0 && oauth.email === void 0 ? "generated" : "oauth"
		};
	});
}
//#endregion
//#region src/store.ts
/**
* Owner-only persistent OAuth credential storage for the OpenAI Codex bundle.
* @module dsh-codex-connect/store
*/
/** Provider route and pi-ai provider id owned by this bundle. */
const OPENAI_CODEX_PROVIDER = "openai-codex";
/** Basename of the OAuth document inside the Harness home. */
const OPENAI_CODEX_AUTH_FILENAME = ".openai-codex-auth.json";
/** Current multi-account on-disk format. */
const AUTH_FORMAT_VERSION = 2;
/** Maximum serialized credential document size. */
const OPENAI_CODEX_AUTH_DOCUMENT_LIMIT = 524288;
/** Suffix used for the one-time version-1 rollback copy. */
const OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX = ".v1-backup";
function accountSummaries(document) {
	if (document === void 0) return [];
	const credentials = documentCredentials(document);
	const profiles = resolveOpenAICodexAccountProfiles(credentials);
	const activeAccountId = activeCredential(document).accountId;
	return credentials.map((credential, index) => ({
		accountKey: accountKey(credential.accountId),
		displayName: profiles[index].displayName,
		...profiles[index].maskedEmail === void 0 ? {} : { maskedEmail: profiles[index].maskedEmail },
		profileSource: profiles[index].source,
		active: credential.accountId === activeAccountId
	}));
}
/** Whether a filesystem error reports an absent path. */
function isENOENT$1(error) {
	return error?.code === "ENOENT";
}
/** Reject a credential document readable by another POSIX user. */
function assertOwnerOnly$1(filename, mode) {
	/* v8 ignore next -- native Windows coverage takes the mode-less branch */
	if (process.platform === "win32") return;
	/* v8 ignore start -- POSIX tests cover this branch; Windows cannot express it */
	if ((mode & 63) !== 0) throw new Error(`openai-codex: ${filename} is readable beyond its owner (mode ${(mode & 511).toString(8)}); run "chmod 600 ${filename}" before starting again`);
	/* v8 ignore stop */
}
/** Validate one OAuth credential without quoting token-bearing input. */
function parseCredential(raw, filename) {
	if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error(`openai-codex: ${filename} credential must be an object`);
	const credential = raw;
	if (Object.keys(credential).some((key) => ![
		"type",
		"access",
		"refresh",
		"expires",
		"accountId"
	].includes(key))) throw new Error(`openai-codex: ${filename} credential contains an unknown field`);
	if (credential["type"] !== "oauth") throw new Error(`openai-codex: ${filename} credential type must be oauth`);
	for (const key of [
		"access",
		"refresh",
		"accountId"
	]) if (typeof credential[key] !== "string" || credential[key].length === 0) throw new Error(`openai-codex: ${filename} credential ${key} must be a non-empty string`);
	if (typeof credential["expires"] !== "number" || !Number.isFinite(credential["expires"]) || credential["expires"] <= 0) throw new Error(`openai-codex: ${filename} credential expires must be a positive finite number`);
	return credential;
}
/** Validate the strict JSON document without quoting token-bearing input. */
function parseDocument$1(text, filename) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`openai-codex: ${filename} is not valid JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`openai-codex: ${filename} must contain an object`);
	const document = value;
	if (document["version"] === 1) {
		if (Object.keys(document).some((key) => key !== "version" && key !== "credential")) throw new Error(`openai-codex: ${filename} contains an unknown top-level field`);
		return {
			version: 1,
			credential: parseCredential(document["credential"], filename)
		};
	}
	if (document["version"] !== AUTH_FORMAT_VERSION) throw new Error(`openai-codex: ${filename} has unsupported auth format version ${String(document["version"])}`);
	if (Object.keys(document).some((key) => ![
		"version",
		"activeAccountId",
		"credentials"
	].includes(key))) throw new Error(`openai-codex: ${filename} contains an unknown top-level field`);
	if (typeof document["activeAccountId"] !== "string" || document["activeAccountId"].length === 0) throw new Error(`openai-codex: ${filename} activeAccountId must be a non-empty string`);
	if (!Array.isArray(document["credentials"]) || document["credentials"].length === 0) throw new Error(`openai-codex: ${filename} credentials must be a non-empty array`);
	if (document["credentials"].length > 16) throw new Error(`openai-codex: ${filename} exceeds the ${String(16)} account limit`);
	const credentials = document["credentials"].map((raw) => parseCredential(raw, filename));
	const accountIds = new Set(credentials.map((credential) => credential.accountId));
	if (accountIds.size !== credentials.length) throw new Error(`openai-codex: ${filename} contains duplicate accountId values`);
	if (!accountIds.has(document["activeAccountId"])) throw new Error(`openai-codex: ${filename} activeAccountId does not identify a stored credential`);
	return {
		version: AUTH_FORMAT_VERSION,
		activeAccountId: document["activeAccountId"],
		credentials
	};
}
/** Detach a credential from callers that may mutate provider-owned extras. */
function cloneCredential(credential) {
	return structuredClone(credential);
}
function documentCredentials(document) {
	return document.version === 1 ? [document.credential] : document.credentials;
}
function activeCredential(document) {
	if (document.version === 1) return document.credential;
	const active = document.credentials.find((credential) => credential.accountId === document.activeAccountId);
	if (active === void 0) throw new Error("openai-codex: active credential invariant failed");
	return active;
}
function accountKey(accountId) {
	return `acct_${createHash("sha256").update(accountId).digest("base64url")}`;
}
function serializeDocument(document) {
	const text = `${JSON.stringify(document, null, 2)}\n`;
	if (Buffer.byteLength(text) > 524288) throw new Error(`openai-codex: credential document exceeds ${String(OPENAI_CODEX_AUTH_DOCUMENT_LIMIT)} bytes`);
	return text;
}
/**
* Resolve the default OAuth document path.
* @param dshHome - optional Harness-home override.
* @returns the absolute owner-only document path.
*/
function openAICodexAuthPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), OPENAI_CODEX_AUTH_FILENAME));
}
/** File-backed pi-ai store scoped to the single OpenAI Codex provider. */
var OpenAICodexCredentialStore = class {
	/** Absolute credential document path. */
	filename;
	/** Owner-only version-1 rollback copy, created at the first migration write. */
	version1BackupFilename;
	/**
	* @param filename - explicit document path, defaulting under `$DSH_HOME`.
	*/
	constructor(filename = openAICodexAuthPath()) {
		this.filename = resolve(filename);
		this.version1BackupFilename = join(dirname(this.filename), `${basename(this.filename)}${OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX}`);
	}
	/** Read and validate the current document without acquiring the writer lock. */
	async readDocument() {
		return this.readDocumentAt(this.filename);
	}
	async readDocumentAt(filename) {
		let handle;
		try {
			handle = await open(filename, "r");
		} catch (error) {
			if (isENOENT$1(error)) return void 0;
			throw error;
		}
		try {
			const info = await handle.stat();
			if (!info.isFile()) throw new Error(`openai-codex: ${filename} must be a regular file`);
			assertOwnerOnly$1(filename, info.mode);
			if (info.size > 524288) throw new Error(`openai-codex: ${filename} exceeds ${String(OPENAI_CODEX_AUTH_DOCUMENT_LIMIT)} bytes`);
			return parseDocument$1(await handle.readFile("utf8"), filename);
		} finally {
			await handle.close();
		}
	}
	async writeDocument(document, previous) {
		const text = serializeDocument(document);
		if (previous?.version === 1) {
			const existingBackup = await this.readDocumentAt(this.version1BackupFilename);
			if (existingBackup === void 0) await writeFileAtomic(this.version1BackupFilename, serializeDocument(previous), {
				mode: 384,
				dirMode: 448
			});
			else if (existingBackup.version !== 1 || serializeDocument(existingBackup) !== serializeDocument(previous)) throw new Error(`openai-codex: ${this.version1BackupFilename} rollback copy does not match the current version 1 credential`);
		}
		await writeFileAtomic(this.filename, text, {
			mode: 384,
			dirMode: 448
		});
	}
	/** @inheritdoc */
	async read(providerId) {
		if (providerId !== "openai-codex") return void 0;
		const document = await this.readDocument();
		return document === void 0 ? void 0 : cloneCredential(activeCredential(document));
	}
	/**
	* Capture the current account for one request's complete auth resolution.
	* Refreshes through the returned store update only that captured account and
	* never change the user's current account selection.
	*/
	async captureActiveAccount() {
		const document = await this.readDocument();
		const captured = document === void 0 ? void 0 : cloneCredential(activeCredential(document));
		const capturedAccountId = captured?.accountId;
		let requestCredential = captured;
		const snapshot = {
			accounts: async () => accountSummaries(document),
			captureActiveAccount: async () => snapshot,
			read: async (providerId) => providerId === "openai-codex" && requestCredential !== void 0 ? cloneCredential(requestCredential) : void 0,
			list: async () => requestCredential === void 0 ? [] : [{
				providerId: OPENAI_CODEX_PROVIDER,
				type: "oauth"
			}],
			modify: async (providerId, fn, options) => {
				options?.signal?.throwIfAborted();
				if (providerId !== "openai-codex") throw new Error(`openai-codex: captured credential store does not own provider "${providerId}"`);
				if (capturedAccountId === void 0) return void 0;
				requestCredential = await this.modifyCapturedAccount(capturedAccountId, fn, options);
				return requestCredential === void 0 ? void 0 : cloneCredential(requestCredential);
			},
			delete: async (providerId) => {
				if (providerId === "openai-codex") throw new Error("openai-codex: a captured request credential cannot log out");
			}
		};
		return snapshot;
	}
	async modifyCapturedAccount(capturedAccountId, fn, options) {
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return this.withWriterLock(async () => {
			const document = await this.readDocument();
			if (document === void 0) return void 0;
			const credentials = [...documentCredentials(document)];
			const capturedIndex = credentials.findIndex((credential) => credential.accountId === capturedAccountId);
			if (capturedIndex < 0) return void 0;
			const current = cloneCredential(credentials[capturedIndex]);
			options?.signal?.throwIfAborted();
			const candidate = await fn(current);
			if (candidate === void 0) return current;
			const validated = parseCredential(candidate, this.filename);
			if (validated.accountId !== capturedAccountId) throw new Error("openai-codex: a request credential refresh cannot change accountId");
			credentials[capturedIndex] = validated;
			await this.writeDocument({
				version: AUTH_FORMAT_VERSION,
				activeAccountId: activeCredential(document).accountId,
				credentials: credentials.map(cloneCredential)
			}, document);
			return cloneCredential(validated);
		});
	}
	/** @inheritdoc */
	async list() {
		return await this.readDocument() === void 0 ? [] : [{
			providerId: OPENAI_CODEX_PROVIDER,
			type: "oauth"
		}];
	}
	/** List browser-safe account summaries without exposing provider account ids. */
	async accounts() {
		return accountSummaries(await this.readDocument());
	}
	/** Resolve the account id stored with one exact access token. */
	async accountIdForAccess(access) {
		const document = await this.readDocument();
		if (document === void 0) return void 0;
		return documentCredentials(document).find((credential) => credential.access === access)?.accountId;
	}
	/** Select a stored account using its browser-safe key. */
	async activate(selectedAccountKey) {
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return this.withWriterLock(async () => {
			const document = await this.readDocument();
			if (document === void 0) throw new Error("openai-codex: account not found");
			const credentials = documentCredentials(document);
			const selected = credentials.find((credential) => accountKey(credential.accountId) === selectedAccountKey);
			if (selected === void 0) throw new Error("openai-codex: account not found");
			await this.writeDocument({
				version: AUTH_FORMAT_VERSION,
				activeAccountId: selected.accountId,
				credentials: credentials.map(cloneCredential)
			}, document);
			return cloneCredential(selected);
		});
	}
	/** Remove one account; active removal requires an explicit stored replacement. */
	async removeAccount(selectedAccountKey, replacementAccountKey) {
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		await this.withWriterLock(async () => {
			const document = await this.readDocument();
			if (document === void 0) throw new Error("openai-codex: account not found");
			const credentials = [...documentCredentials(document)];
			const removeIndex = credentials.findIndex((credential) => accountKey(credential.accountId) === selectedAccountKey);
			if (removeIndex < 0) throw new Error("openai-codex: account not found");
			const removed = credentials[removeIndex];
			const active = activeCredential(document);
			const remaining = credentials.filter((_, index) => index !== removeIndex);
			let nextActive = active.accountId;
			if (removed.accountId === active.accountId && remaining.length > 0) {
				if (replacementAccountKey === void 0) throw new Error("openai-codex: removing the active account requires replacementAccountKey");
				const replacement = remaining.find((credential) => accountKey(credential.accountId) === replacementAccountKey);
				if (replacement === void 0) throw new Error("openai-codex: replacement account not found");
				nextActive = replacement.accountId;
			} else if (replacementAccountKey !== void 0) throw new Error("openai-codex: replacementAccountKey is only valid when removing the active account");
			await rm(this.version1BackupFilename, { force: true });
			if (remaining.length === 0) {
				await rm(this.filename, { force: true });
				return;
			}
			await this.writeDocument({
				version: AUTH_FORMAT_VERSION,
				activeAccountId: nextActive,
				credentials: remaining.map(cloneCredential)
			});
		});
	}
	/** @inheritdoc */
	async modify(providerId, fn, options) {
		options?.signal?.throwIfAborted();
		if (providerId !== "openai-codex") throw new Error(`openai-codex: credential store does not own provider "${providerId}"`);
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return this.withWriterLock(async () => {
			const currentDocument = await this.readDocument();
			const current = currentDocument === void 0 ? void 0 : cloneCredential(activeCredential(currentDocument));
			options?.signal?.throwIfAborted();
			const candidate = await fn(current);
			if (candidate === void 0) return current;
			const validated = parseCredential(candidate, this.filename);
			const credentials = currentDocument === void 0 ? [] : [...documentCredentials(currentDocument)];
			const existingIndex = credentials.findIndex((credential) => credential.accountId === validated.accountId);
			if (existingIndex >= 0) credentials[existingIndex] = validated;
			else credentials.push(validated);
			if (credentials.length > 16) throw new Error(`openai-codex: credential store accepts at most ${String(16)} accounts`);
			await this.writeDocument({
				version: AUTH_FORMAT_VERSION,
				activeAccountId: validated.accountId,
				credentials: credentials.map(cloneCredential)
			}, currentDocument);
			return cloneCredential(validated);
		});
	}
	/** @inheritdoc */
	async delete(providerId) {
		if (providerId !== "openai-codex") return;
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		await this.withWriterLock(async () => {
			await rm(this.filename, { force: true });
			await rm(this.version1BackupFilename, { force: true });
		});
	}
	/** Allow the provider's 15-second refresh plus bounded filesystem completion. */
	withWriterLock(operation) {
		return withFileLock(this.filename, operation, { waitMs: 2e4 });
	}
};
const SUPPORTED_NODE_RANGE = "^22.19.0 || >=24.0.0";
const SUPPORTED_DSH_PLUGIN_API_VERSIONS = ["0.1.7-rc.1"];
const SUPPORTED_DSH_PLUGIN_API_RANGE = SUPPORTED_DSH_PLUGIN_API_VERSIONS.join(" || ");
const SUPPORTED_PI_AI_RANGE = "0.85.1";
const PI_AI_PACKAGE = "@earendil-works/pi-ai";
const DSH_PLUGIN_API_PACKAGES = [
	"@deepseek-ai/dsh-agent",
	"@deepseek-ai/dsh-atomic-write",
	"@deepseek-ai/dsh-attachment",
	"@deepseek-ai/dsh-compaction",
	"@deepseek-ai/dsh-home-paths",
	"@deepseek-ai/dsh-host-webserver",
	"@deepseek-ai/dsh-invariants",
	"@deepseek-ai/dsh-llm",
	"@deepseek-ai/dsh-llm-pi-ai",
	"@deepseek-ai/dsh-fs",
	"@deepseek-ai/dsh-session",
	"@deepseek-ai/dsh-settings",
	"@deepseek-ai/dsh-tools",
	"@deepseek-ai/dsh-util-values",
	"@deepseek-ai/dsh-web"
];
const COMPATIBILITY_PACKAGES = [
	"@deepseek-ai/dsh-llm",
	"@deepseek-ai/dsh-llm-pi-ai",
	"@deepseek-ai/dsh-compaction",
	PI_AI_PACKAGE
];
const PACKAGE_JSON_SEARCH_DEPTH = 8;
/** Whether the API version is one of the explicitly targeted host versions. */
function isSupportedDshPluginApiVersion(value) {
	return SUPPORTED_DSH_PLUGIN_API_VERSIONS.some((version) => version === value);
}
function piAiVersionStatus(value) {
	return value.trim() === "0.85.1" ? "compatible" : "unverified";
}
function parseNodeVersion(value) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/u.exec(value.trim());
	if (match === null) return void 0;
	const major = Number(match[1]);
	const minor = Number(match[2]);
	const patch = Number(match[3]);
	if (![
		major,
		minor,
		patch
	].every(Number.isSafeInteger)) return void 0;
	return [
		major,
		minor,
		patch
	];
}
function nodeStatus(value) {
	if (value === void 0 || value === null || value.trim() === "") return "unknown";
	const parsed = parseNodeVersion(value);
	if (parsed === void 0) return "unknown";
	const [major, minor, patch] = parsed;
	if (major === 22) return minor > 19 || minor === 19 && patch >= 0 ? "compatible" : "incompatible";
	return major >= 24 ? "compatible" : "incompatible";
}
function packageEntry(supported, installed, status) {
	return {
		supported,
		installed: installed ?? null,
		status: installed === void 0 || installed === null || installed === "" ? "unknown" : status(installed)
	};
}
function nodeEntry(installed) {
	return {
		supported: SUPPORTED_NODE_RANGE,
		installed: installed ?? null,
		status: nodeStatus(installed)
	};
}
function aggregateStatus(entries) {
	if (entries.some((entry) => entry.status === "incompatible")) return "incompatible";
	if (entries.some((entry) => entry.status === "unknown")) return "unknown";
	if (entries.some((entry) => entry.status === "unverified")) return "unverified";
	return "compatible";
}
/** Evaluate a captured set of versions without touching the filesystem. */
function evaluateCompatibility(input = {}) {
	const installedNode = input.nodeVersion ?? input.node ?? input.installed?.node;
	const suppliedPackages = input.packageVersions ?? input.packages ?? input.installed?.packages ?? {};
	const packages = {
		"@deepseek-ai/dsh-llm": packageEntry(SUPPORTED_DSH_PLUGIN_API_RANGE, suppliedPackages["@deepseek-ai/dsh-llm"], (value) => isSupportedDshPluginApiVersion(value) ? "compatible" : "unverified"),
		"@deepseek-ai/dsh-llm-pi-ai": packageEntry(SUPPORTED_DSH_PLUGIN_API_RANGE, suppliedPackages["@deepseek-ai/dsh-llm-pi-ai"], (value) => isSupportedDshPluginApiVersion(value) ? "compatible" : "unverified"),
		"@deepseek-ai/dsh-compaction": packageEntry(SUPPORTED_DSH_PLUGIN_API_RANGE, suppliedPackages["@deepseek-ai/dsh-compaction"], (value) => isSupportedDshPluginApiVersion(value) ? "compatible" : "unverified"),
		[PI_AI_PACKAGE]: packageEntry(SUPPORTED_PI_AI_RANGE, suppliedPackages[PI_AI_PACKAGE], piAiVersionStatus)
	};
	const node = nodeEntry(installedNode);
	const status = aggregateStatus([node, ...Object.values(packages)]);
	const dshVersion = packages["@deepseek-ai/dsh-llm"].installed;
	const piVersion = packages[PI_AI_PACKAGE].installed;
	const matchedPair = dshVersion === packages["@deepseek-ai/dsh-llm-pi-ai"].installed && dshVersion === packages["@deepseek-ai/dsh-compaction"].installed && dshVersion === "0.1.7-rc.1" && piVersion === "0.85.1";
	return {
		schemaVersion: 1,
		status: status === "compatible" && !matchedPair ? "unverified" : status,
		node,
		packages
	};
}
/**
* Resolve installed package metadata without returning a filesystem path.
* @param name - package to resolve from this plugin installation.
* @returns its version, or undefined when metadata cannot be read.
*/
async function readInstalledPackageVersion(name, installAnchor) {
	if (installAnchor !== void 0) {
		let anchor;
		try {
			anchor = await realpath(installAnchor);
			if (JSON.parse(await readFile(anchor, "utf8")).name !== "@deepseek-ai/dsh") return void 0;
		} catch {
			return;
		}
		const packageDirectory = dirname(anchor);
		const scopeDirectory = dirname(packageDirectory);
		const modulesDirectory = dirname(scopeDirectory);
		if (basename(packageDirectory) !== "dsh" || basename(scopeDirectory) !== "@deepseek-ai" || basename(modulesDirectory) !== "node_modules") return void 0;
		try {
			const parsed = JSON.parse(await readFile(join(modulesDirectory, name, "package.json"), "utf8"));
			return parsed.name === name && typeof parsed.version === "string" ? parsed.version : void 0;
		} catch {
			return;
		}
	}
	let entry;
	try {
		const resolved = import.meta.resolve(name);
		if (!resolved.startsWith("file:")) return void 0;
		entry = fileURLToPath(resolved);
	} catch {
		return;
	}
	let directory = dirname(entry);
	for (let depth = 0; depth < PACKAGE_JSON_SEARCH_DEPTH; depth += 1) {
		const candidate = join(directory, "package.json");
		try {
			const parsed = JSON.parse(await readFile(candidate, "utf8"));
			if (parsed.name === name && typeof parsed.version === "string") return parsed.version;
		} catch {}
		const parent = parse(directory).root === directory ? directory : dirname(directory);
		if (parent === directory) break;
		directory = parent;
	}
}
/** Read installed package metadata and return only versions and statuses. */
async function detectCompatibility(options = {}) {
	const readVersion = options.readPackageVersion ?? ((name) => readInstalledPackageVersion(name, options.installAnchor));
	const packageVersions = options.packageVersions ?? options.packages ?? options.installed?.packages;
	const resolvedPackages = packageVersions === void 0 ? Object.fromEntries(await Promise.all(COMPATIBILITY_PACKAGES.map(async (name) => [name, await readVersion(name)]))) : packageVersions;
	return evaluateCompatibility({
		nodeVersion: options.nodeVersion ?? options.node ?? options.installed?.node ?? process.version,
		packageVersions: resolvedPackages
	});
}
//#endregion
//#region src/version.ts
const CODEX_CONNECT_VERSION = "0.1.0-alpha.4.43";
//#endregion
//#region src/doctor.ts
/** Secret-free diagnostics and duplicate-provider guidance. */
/** Actionable message for legacy/manual `openai-codex` adapter collisions. */
function openAICodexConflictMessage() {
	return "Codex Connect cannot register provider \"openai-codex\" because another adapter already owns it. Remove or disable the legacy dsh-codex bundle or manual openai-codex provider row, then restart Harness.";
}
/**
* Inspect only process and filesystem metadata. This function never opens the
* OAuth document, refreshes a token, or starts an authorization flow.
*/
async function diagnoseOpenAICodex(options = {}) {
	const path = options.credentialPath ?? openAICodexAuthPath();
	let state = "missing";
	let mode;
	try {
		const info = await lstat(path);
		if (!info.isFile()) state = "not-a-regular-file";
		else if (process.platform === "win32") state = "owner-only";
		else {
			mode = (info.mode & 511).toString(8).padStart(3, "0");
			state = (info.mode & 63) === 0 ? "owner-only" : "permissions-too-broad";
		}
	} catch (error) {
		state = error?.code === "ENOENT" ? "missing" : "unreadable-metadata";
	}
	const providerConflict = options.providerIds?.includes("openai-codex") ?? false;
	const compatibility = await detectCompatibility(options.compatibilityOptions);
	const hints = [];
	if (state === "missing") hints.push("Sign in only when you are ready; installation does not start OAuth.");
	if (state === "permissions-too-broad") hints.push(`Restrict the OAuth file to its owner before use (current mode ${mode}).`);
	if (state === "not-a-regular-file") hints.push("Replace the OAuth path with an owner-only regular file created by Codex Connect login.");
	if (state === "unreadable-metadata") hints.push("Harness could not inspect the OAuth file metadata; check the parent directory and file ownership.");
	if (providerConflict) hints.push(openAICodexConflictMessage());
	if (!providerConflict) hints.push("If Harness reports a duplicate openai-codex adapter, remove the legacy bundle or manual provider row.");
	if (compatibility.status === "incompatible") hints.push("The installed Node version does not satisfy the declared engine requirement. This diagnostic does not recommend changing the DSH version.");
	else if (compatibility.status === "unverified") hints.push("Dependency versions are outside the declared supported set. This combination is unverified, not proven broken. Keep the current DSH installation; investigate specific failures or consult the maintainer before changing versions.");
	else if (compatibility.status === "unknown") hints.push("Compatibility is unknown: verify the declared DSH plugin API and @earendil-works/pi-ai versions, then run doctor again.");
	return {
		package: "dsh-codex-connect",
		version: CODEX_CONNECT_VERSION,
		node: process.version,
		credentialFile: {
			path,
			state,
			...mode === void 0 ? {} : { mode }
		},
		capabilities: {
			modelProvider: true,
			search: options.enableSearch === true,
			imageTool: options.enableImageTool === true,
			imageGeneration: options.enableImageGeneration === true,
			changesHarnessDefaultModel: false,
			changesHarnessSearchRoute: options.enableSearch === true
		},
		providerConflict,
		compatibility,
		hints
	};
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/auth/helpers.js
/**
* Wraps a dynamically imported `OAuthAuth` so provider definitions can
* advertise OAuth without importing the implementation. The flow loads on
* first `login`/`refresh`/`toAuth` call; callers keep Node-only flow code out
* of bundles by loading through a bundler-opaque dynamic import (variable
* specifier, see the bedrock lazy wrapper).
*/
function lazyOAuth(input) {
	let promise;
	const loaded = () => {
		promise ??= input.load();
		return promise;
	};
	return {
		name: input.name,
		isSubscription: input.isSubscription,
		loginLabel: input.loginLabel,
		login: async (interaction) => (await loaded()).login(interaction),
		refresh: async (credential, signal) => (await loaded()).refresh(credential, signal),
		toAuth: async (credential) => (await loaded()).toAuth(credential)
	};
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.lazy.js
const openAICodexResponsesApi = () => lazyApi(() => import("./openai-codex-responses-BG-O8Ytj.js"));
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/auth/oauth/load.js
var __rewriteRelativeImportExtension = function(path, preserveJsx) {
	if (typeof path === "string" && /^\.\.?\//.test(path)) return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function(m, tsx, d, ext, cm) {
		return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : d + ext + "." + cm.toLowerCase() + "js";
	});
	return path;
};
/**
* Loads an OAuth flow module through a variable specifier so bundlers cannot
* follow the import into Node-only flow code (`node:http` callback servers,
* `node:crypto` PKCE). The `.ts`/`.js` rewrite keeps the trick working from
* both source and built output.
*/
const importOAuthModule = (specifier) => {
	return import(__rewriteRelativeImportExtension(import.meta.url.endsWith(".js") ? specifier.replace(/\.ts$/, ".js") : specifier));
};
const loadOpenAICodexOAuth = async () => {
	return (await importOAuthModule("./openai-codex.ts")).openaiCodexOAuth;
};
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/providers/data/openai-codex.json
var openai_codex_default = { "openai-codex-responses": {
	"gpt-5.3-codex-spark": {
		"id": "gpt-5.3-codex-spark",
		"name": "GPT-5.3 Codex Spark",
		"api": "openai-codex-responses",
		"provider": "openai-codex",
		"baseUrl": "https://chatgpt.com/backend-api",
		"reasoning": true,
		"input": ["text"],
		"cost": {
			"input": 1.75,
			"output": 14,
			"cacheRead": .175,
			"cacheWrite": 0
		},
		"contextWindow": 128e3,
		"maxTokens": 128e3,
		"thinkingLevelMap": {
			"xhigh": "xhigh",
			"minimal": "low"
		},
		"compat": { "supportsOpenAIGrammarTools": true }
	},
	"gpt-5.4": {
		"id": "gpt-5.4",
		"name": "GPT-5.4",
		"api": "openai-codex-responses",
		"provider": "openai-codex",
		"baseUrl": "https://chatgpt.com/backend-api",
		"reasoning": true,
		"input": ["text", "image"],
		"cost": {
			"input": 2.5,
			"output": 15,
			"cacheRead": .25,
			"cacheWrite": 0,
			"tiers": [{
				"inputTokensAbove": 272e3,
				"input": 5,
				"output": 22.5,
				"cacheRead": .5,
				"cacheWrite": 0
			}]
		},
		"contextWindow": 272e3,
		"maxTokens": 128e3,
		"thinkingLevelMap": {
			"xhigh": "xhigh",
			"minimal": "low"
		},
		"compat": {
			"supportsOpenAIGrammarTools": true,
			"supportsToolSearch": true
		}
	},
	"gpt-5.4-mini": {
		"id": "gpt-5.4-mini",
		"name": "GPT-5.4 mini",
		"api": "openai-codex-responses",
		"provider": "openai-codex",
		"baseUrl": "https://chatgpt.com/backend-api",
		"reasoning": true,
		"input": ["text", "image"],
		"cost": {
			"input": .75,
			"output": 4.5,
			"cacheRead": .075,
			"cacheWrite": 0
		},
		"contextWindow": 272e3,
		"maxTokens": 128e3,
		"thinkingLevelMap": {
			"xhigh": "xhigh",
			"minimal": "low"
		},
		"compat": {
			"supportsOpenAIGrammarTools": true,
			"supportsToolSearch": true
		}
	},
	"gpt-5.5": {
		"id": "gpt-5.5",
		"name": "GPT-5.5",
		"api": "openai-codex-responses",
		"provider": "openai-codex",
		"baseUrl": "https://chatgpt.com/backend-api",
		"reasoning": true,
		"input": ["text", "image"],
		"cost": {
			"input": 5,
			"output": 30,
			"cacheRead": .5,
			"cacheWrite": 0,
			"tiers": [{
				"inputTokensAbove": 272e3,
				"input": 10,
				"output": 45,
				"cacheRead": 1,
				"cacheWrite": 0
			}]
		},
		"contextWindow": 272e3,
		"maxTokens": 128e3,
		"thinkingLevelMap": {
			"xhigh": "xhigh",
			"minimal": "low"
		},
		"compat": {
			"supportsOpenAIGrammarTools": true,
			"supportsToolSearch": true
		}
	},
	"gpt-5.6-luna": {
		"id": "gpt-5.6-luna",
		"name": "GPT-5.6 Luna",
		"api": "openai-codex-responses",
		"provider": "openai-codex",
		"baseUrl": "https://chatgpt.com/backend-api",
		"reasoning": true,
		"input": ["text", "image"],
		"cost": {
			"input": .2,
			"output": 1.2,
			"cacheRead": .02,
			"cacheWrite": .25,
			"tiers": [{
				"inputTokensAbove": 272e3,
				"input": .4,
				"output": 1.8,
				"cacheRead": .04,
				"cacheWrite": .5
			}]
		},
		"contextWindow": 272e3,
		"maxTokens": 128e3,
		"thinkingLevelMap": {
			"xhigh": "xhigh",
			"max": "max",
			"minimal": "low"
		},
		"compat": {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true
		}
	},
	"gpt-5.6-sol": {
		"id": "gpt-5.6-sol",
		"name": "GPT-5.6 Sol",
		"api": "openai-codex-responses",
		"provider": "openai-codex",
		"baseUrl": "https://chatgpt.com/backend-api",
		"reasoning": true,
		"input": ["text", "image"],
		"cost": {
			"input": 5,
			"output": 30,
			"cacheRead": .5,
			"cacheWrite": 6.25,
			"tiers": [{
				"inputTokensAbove": 272e3,
				"input": 10,
				"output": 45,
				"cacheRead": 1,
				"cacheWrite": 12.5
			}]
		},
		"contextWindow": 272e3,
		"maxTokens": 128e3,
		"thinkingLevelMap": {
			"xhigh": "xhigh",
			"max": "max",
			"minimal": "low"
		},
		"compat": {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true
		}
	},
	"gpt-5.6-terra": {
		"id": "gpt-5.6-terra",
		"name": "GPT-5.6 Terra",
		"api": "openai-codex-responses",
		"provider": "openai-codex",
		"baseUrl": "https://chatgpt.com/backend-api",
		"reasoning": true,
		"input": ["text", "image"],
		"cost": {
			"input": 2,
			"output": 12,
			"cacheRead": .2,
			"cacheWrite": 2.5,
			"tiers": [{
				"inputTokensAbove": 272e3,
				"input": 4,
				"output": 18,
				"cacheRead": .4,
				"cacheWrite": 5
			}]
		},
		"contextWindow": 272e3,
		"maxTokens": 128e3,
		"thinkingLevelMap": {
			"xhigh": "xhigh",
			"max": "max",
			"minimal": "low"
		},
		"compat": {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true
		}
	},
	"gpt-6-astra": {
		"id": "gpt-6-astra",
		"name": "GPT-6 Astra",
		"api": "openai-codex-responses",
		"provider": "openai-codex",
		"baseUrl": "https://chatgpt.com/backend-api",
		"reasoning": true,
		"input": ["text", "image"],
		"cost": {
			"input": 10,
			"output": 50,
			"cacheRead": 1,
			"cacheWrite": 12.5,
			"tiers": [{
				"inputTokensAbove": 272e3,
				"input": 20,
				"output": 75,
				"cacheRead": 2,
				"cacheWrite": 25
			}]
		},
		"contextWindow": 272e3,
		"maxTokens": 128e3,
		"thinkingLevelMap": {
			"off": null,
			"minimal": "low",
			"low": "low",
			"medium": "medium",
			"high": "high",
			"xhigh": "xhigh",
			"max": "max"
		},
		"compat": {
			"supportsOpenAIGrammarTools": true,
			"supportsAdditionalTools": true,
			"supportsToolSearch": true
		}
	}
} };
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/model-catalog.js
function flattenModelCatalog(_provider, groups) {
	return Object.assign({}, ...Object.values(groups));
}
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/providers/openai-codex.models.js
const OPENAI_CODEX_MODELS = flattenModelCatalog("openai-codex", openai_codex_default);
//#endregion
//#region node_modules/.pnpm/@earendil-works+pi-ai@0.85.1_ws@8.21.3_zod@4.4.3/node_modules/@earendil-works/pi-ai/dist/providers/openai-codex.js
function openaiCodexProvider() {
	return createProvider({
		id: "openai-codex",
		name: "OpenAI Codex",
		baseUrl: "https://chatgpt.com/backend-api",
		auth: { oauth: lazyOAuth({
			name: "OpenAI (ChatGPT Plus/Pro)",
			isSubscription: true,
			load: loadOpenAICodexOAuth
		}) },
		models: Object.values(OPENAI_CODEX_MODELS),
		api: openAICodexResponsesApi()
	});
}
//#endregion
//#region vendor/pi-ai-oauth/utils/provider-env.js
let procEnvCache = null;
/**
* Fallback for https://github.com/oven-sh/bun/issues/27802.
* Bun compiled binaries can expose an empty process.env inside Linux sandboxes
* even though /proc/self/environ contains the environment.
*
* This intentionally duplicates restoreSandboxEnv() in
* packages/coding-agent/src/bun/restore-sandbox-env.ts. The ai package can be
* used directly, without going through that entrypoint, so provider env lookup
* must not depend on process.env having been patched.
*/
function getBunSandboxEnvValue(name) {
	if (typeof process === "undefined" || !process.versions?.bun || Object.keys(process.env).length > 0) return;
	if (procEnvCache === null) {
		procEnvCache = /* @__PURE__ */ new Map();
		try {
			const { readFileSync } = __require("node:fs");
			const data = readFileSync("/proc/self/environ", "utf-8");
			for (const entry of data.split("\0")) {
				const idx = entry.indexOf("=");
				if (idx > 0) procEnvCache.set(entry.slice(0, idx), entry.slice(idx + 1));
			}
		} catch {}
	}
	return procEnvCache.get(name);
}
/**
* Resolve a provider env value from scoped overrides, normal process.env, then
* the duplicated Bun sandbox fallback for direct pi-ai consumers.
*/
function getProviderEnvValue(name, env) {
	return env?.[name] || (typeof process !== "undefined" ? process.env[name] : void 0) || getBunSandboxEnvValue(name) || void 0;
}
//#endregion
//#region vendor/pi-ai-oauth/auth/oauth/device-code.js
const CANCEL_MESSAGE = "Login cancelled";
const TIMEOUT_MESSAGE = "Device flow timed out";
const SLOW_DOWN_TIMEOUT_MESSAGE = "Device flow timed out after one or more slow_down responses. This is often caused by clock drift in WSL or VM environments. Please sync or restart the VM clock and try again.";
const MINIMUM_INTERVAL_MS = 1e3;
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const SLOW_DOWN_INTERVAL_INCREMENT_MS = 5e3;
function abortableSleep(ms, signal, cancelMessage) {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error(cancelMessage));
			return;
		}
		const onAbort = () => {
			clearTimeout(timeout);
			reject(new Error(cancelMessage));
		};
		const timeout = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, ms);
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
async function pollOAuthDeviceCodeFlow(options) {
	const deadline = typeof options.expiresInSeconds === "number" ? Date.now() + options.expiresInSeconds * 1e3 : Number.POSITIVE_INFINITY;
	let intervalMs = Math.max(MINIMUM_INTERVAL_MS, Math.floor((options.intervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS) * 1e3));
	let slowDownResponses = 0;
	if (options.waitBeforeFirstPoll) {
		const remainingMs = deadline - Date.now();
		if (remainingMs > 0) await abortableSleep(Math.min(intervalMs, remainingMs), options.signal, CANCEL_MESSAGE);
	}
	while (Date.now() < deadline) {
		if (options.signal.aborted) throw new Error(CANCEL_MESSAGE);
		const result = await options.poll();
		if (result.status === "complete") return result.value;
		if (result.status === "failed") throw new Error(result.message);
		if (result.status === "slow_down") {
			slowDownResponses += 1;
			intervalMs = typeof result.intervalSeconds === "number" && Number.isFinite(result.intervalSeconds) && result.intervalSeconds > 0 ? Math.max(MINIMUM_INTERVAL_MS, Math.floor(result.intervalSeconds * 1e3)) : Math.max(MINIMUM_INTERVAL_MS, intervalMs + SLOW_DOWN_INTERVAL_INCREMENT_MS);
		}
		const remainingMs = deadline - Date.now();
		if (remainingMs <= 0) break;
		await abortableSleep(Math.min(intervalMs, remainingMs), options.signal, CANCEL_MESSAGE);
	}
	throw new Error(slowDownResponses > 0 ? SLOW_DOWN_TIMEOUT_MESSAGE : TIMEOUT_MESSAGE);
}
//#endregion
//#region vendor/pi-ai-oauth/auth/oauth/oauth-page.js
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" aria-hidden="true"><path fill="#fff" fill-rule="evenodd" d="M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z"/><path fill="#fff" d="M517.36 400 H634.72 V634.72 H517.36 Z"/></svg>`;
function escapeHtml(value) {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("'", "&#39;");
}
function renderPage(options) {
	const title = escapeHtml(options.title);
	const heading = escapeHtml(options.heading);
	const message = escapeHtml(options.message);
	const details = options.details ? escapeHtml(options.details) : void 0;
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      --text: #fafafa;
      --text-dim: #a1a1aa;
      --page-bg: #09090b;
      --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    }
    * { box-sizing: border-box; }
    html { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: var(--page-bg);
      color: var(--text);
      font-family: var(--font-sans);
      text-align: center;
    }
    main {
      width: 100%;
      max-width: 560px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .logo {
      width: 72px;
      height: 72px;
      display: block;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.15;
      font-weight: 650;
      color: var(--text);
    }
    p {
      margin: 0;
      line-height: 1.7;
      color: var(--text-dim);
      font-size: 15px;
    }
    .details {
      margin-top: 16px;
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-dim);
      white-space: pre-wrap;
      word-break: break-word;
    }
  </style>
</head>
<body>
  <main>
    <div class="logo">${LOGO_SVG}</div>
    <h1>${heading}</h1>
    <p>${message}</p>
    ${details ? `<div class="details">${details}</div>` : ""}
  </main>
</body>
</html>`;
}
function oauthSuccessHtml(message) {
	return renderPage({
		title: "Authentication successful",
		heading: "Authentication successful",
		message
	});
}
function oauthErrorHtml(message, details) {
	return renderPage({
		title: "Authentication failed",
		heading: "Authentication failed",
		message,
		details
	});
}
//#endregion
//#region vendor/pi-ai-oauth/auth/oauth/pkce.js
/**
* PKCE utilities using Web Crypto API.
* Works in both Node.js 20+ and browsers.
*/
/**
* Encode bytes as base64url string.
*/
function base64urlEncode(bytes) {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
/**
* Generate PKCE code verifier and challenge.
* Uses Web Crypto API for cross-platform compatibility.
*/
async function generatePKCE() {
	const verifierBytes = /* @__PURE__ */ new Uint8Array(32);
	crypto.getRandomValues(verifierBytes);
	const verifier = base64urlEncode(verifierBytes);
	const data = new TextEncoder().encode(verifier);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return {
		verifier,
		challenge: base64urlEncode(new Uint8Array(hashBuffer))
	};
}
//#endregion
//#region vendor/pi-ai-oauth/auth/oauth/openai-codex.js
/**
* OpenAI Codex (ChatGPT OAuth) flow
*
* NOTE: This module uses Node.js crypto and http for the OAuth callback.
* It is only intended for CLI use, not browser environments.
*/
let _randomBytes = null;
let _http = null;
if (typeof process !== "undefined" && (process.versions?.node || process.versions?.bun)) {
	import("node:crypto").then((m) => {
		_randomBytes = m.randomBytes;
	});
	import("node:http").then((m) => {
		_http = m;
	});
}
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTH_BASE_URL = "https://auth.openai.com";
const AUTHORIZE_URL = `${AUTH_BASE_URL}/oauth/authorize`;
const TOKEN_URL = `${AUTH_BASE_URL}/oauth/token`;
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const DEVICE_USER_CODE_URL = `${AUTH_BASE_URL}/api/accounts/deviceauth/usercode`;
const DEVICE_TOKEN_URL = `${AUTH_BASE_URL}/api/accounts/deviceauth/token`;
const DEVICE_VERIFICATION_URI = `${AUTH_BASE_URL}/codex/device`;
const DEVICE_REDIRECT_URI = `${AUTH_BASE_URL}/deviceauth/callback`;
const DEVICE_CODE_TIMEOUT_SECONDS = 900;
const OPENAI_CODEX_BROWSER_LOGIN_METHOD = "browser";
const OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD = "device_code";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";
function getCallbackHost() {
	return getProviderEnvValue("PI_OAUTH_CALLBACK_HOST") || "127.0.0.1";
}
function createState() {
	if (!_randomBytes) throw new Error("OpenAI Codex OAuth is only available in Node.js environments");
	return _randomBytes(16).toString("hex");
}
function parseAuthorizationInput(input) {
	const value = input.trim();
	if (!value) return {};
	try {
		const url = new URL(value);
		return {
			code: url.searchParams.get("code") ?? void 0,
			state: url.searchParams.get("state") ?? void 0
		};
	} catch {}
	if (value.includes("#")) {
		const [code, state] = value.split("#", 2);
		return {
			code,
			state
		};
	}
	if (value.includes("code=")) {
		const params = new URLSearchParams(value);
		return {
			code: params.get("code") ?? void 0,
			state: params.get("state") ?? void 0
		};
	}
	return { code: value };
}
function decodeJwt(token) {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;
		const payload = parts[1] ?? "";
		if (!/^[A-Za-z0-9_-]+={0,2}$/.test(payload)) return null;
		const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
		const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
		const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
		return JSON.parse(decoded);
	} catch {
		return null;
	}
}
async function fetchWithLoginCancellation(input, init) {
	try {
		return await fetch(input, init);
	} catch (error) {
		if (init.signal?.aborted) throw new Error("Login cancelled");
		throw error;
	}
}
/** A structured refresh rejection, without response text or credential data. */
var OpenAICodexRefreshRejectedError = class extends Error {
	constructor() {
		super("OpenAI Codex refresh authorization was rejected");
		this.name = "OpenAICodexRefreshRejectedError";
	}
};
async function readTokenResponse(response, operation) {
	if (!response.ok) {
		const text = await response.text().catch(() => "");
		if (operation === "refresh" && (response.status === 400 || response.status === 401)) {
			let failure;
			try {
				failure = JSON.parse(text);
			} catch {}
			if (failure !== null && typeof failure === "object" && failure.error === "invalid_grant") throw new OpenAICodexRefreshRejectedError();
		}
		throw new Error(`OpenAI Codex token ${operation} failed (${response.status}): ${text || response.statusText}`);
	}
	const json = await response.json();
	if (!json?.access_token || !json.refresh_token || typeof json.expires_in !== "number") throw new Error(`OpenAI Codex token ${operation} response missing fields: ${JSON.stringify(json)}`);
	return {
		access: json.access_token,
		refresh: json.refresh_token,
		expires: Date.now() + json.expires_in * 1e3
	};
}
async function exchangeAuthorizationCode(code, verifier, redirectUri, signal) {
	return readTokenResponse(await fetchWithLoginCancellation(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: CLIENT_ID,
			code,
			code_verifier: verifier,
			redirect_uri: redirectUri
		}),
		signal
	}), "exchange");
}
async function refreshAccessToken(refreshToken, signal) {
	let response;
	try {
		response = await fetch(TOKEN_URL, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				grant_type: "refresh_token",
				refresh_token: refreshToken,
				client_id: CLIENT_ID
			}),
			signal
		});
	} catch (error) {
		throw new Error(`OpenAI Codex token refresh error: ${error instanceof Error ? error.message : String(error)}`);
	}
	return readTokenResponse(response, "refresh");
}
async function startOpenAICodexDeviceAuth(signal) {
	const response = await fetchWithLoginCancellation(DEVICE_USER_CODE_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ client_id: CLIENT_ID }),
		signal
	});
	if (!response.ok) {
		if (response.status === 404) throw new Error("OpenAI Codex device code login is not enabled for this server. Use browser login or verify the server URL.");
		const responseBody = await response.text().catch(() => "");
		throw new Error(`OpenAI Codex device code request failed with status ${response.status}${responseBody ? `: ${responseBody}` : ""}`);
	}
	const json = await response.json();
	const intervalSeconds = typeof json?.interval === "string" ? Number(json.interval.trim()) : json?.interval;
	if (!json?.device_auth_id || !json.user_code || typeof intervalSeconds !== "number" || !Number.isFinite(intervalSeconds) || intervalSeconds < 0) throw new Error(`Invalid OpenAI Codex device code response: ${JSON.stringify(json)}`);
	return {
		deviceAuthId: json.device_auth_id,
		userCode: json.user_code,
		intervalSeconds
	};
}
async function pollOpenAICodexDeviceAuth(device, signal) {
	return pollOAuthDeviceCodeFlow({
		intervalSeconds: device.intervalSeconds,
		expiresInSeconds: DEVICE_CODE_TIMEOUT_SECONDS,
		signal,
		poll: async () => {
			const response = await fetchWithLoginCancellation(DEVICE_TOKEN_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					device_auth_id: device.deviceAuthId,
					user_code: device.userCode
				}),
				signal
			});
			if (response.ok) {
				const json = await response.json();
				if (!json?.authorization_code || !json.code_verifier) return {
					status: "failed",
					message: `Invalid OpenAI Codex device auth token response: ${JSON.stringify(json)}`
				};
				return {
					status: "complete",
					value: {
						authorizationCode: json.authorization_code,
						codeVerifier: json.code_verifier
					}
				};
			}
			if (response.status === 403 || response.status === 404) return { status: "pending" };
			const responseBody = await response.text().catch(() => "");
			let errorCode;
			try {
				const error = JSON.parse(responseBody)?.error;
				errorCode = typeof error === "object" ? error?.code : error;
			} catch {}
			if (errorCode === "deviceauth_authorization_pending") return { status: "pending" };
			if (errorCode === "slow_down") return { status: "slow_down" };
			return {
				status: "failed",
				message: `OpenAI Codex device auth failed with status ${response.status}${responseBody ? `: ${responseBody}` : ""}`
			};
		}
	});
}
async function createAuthorizationFlow(originator = "pi") {
	const { verifier, challenge } = await generatePKCE();
	const state = createState();
	const url = new URL(AUTHORIZE_URL);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", CLIENT_ID);
	url.searchParams.set("redirect_uri", REDIRECT_URI);
	url.searchParams.set("scope", SCOPE);
	url.searchParams.set("code_challenge", challenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);
	url.searchParams.set("id_token_add_organizations", "true");
	url.searchParams.set("codex_cli_simplified_flow", "true");
	url.searchParams.set("originator", originator);
	return {
		verifier,
		state,
		url: url.toString()
	};
}
function startLocalOAuthServer(state) {
	if (!_http) throw new Error("OpenAI Codex OAuth is only available in Node.js environments");
	let settleWait;
	const waitForCodePromise = new Promise((resolve) => {
		let settled = false;
		settleWait = (value) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
	});
	const server = _http.createServer((req, res) => {
		try {
			const url = new URL(req.url || "", "http://localhost");
			if (url.pathname !== "/auth/callback") {
				res.statusCode = 404;
				res.setHeader("Content-Type", "text/html; charset=utf-8");
				res.end(oauthErrorHtml("Callback route not found."));
				return;
			}
			if (url.searchParams.get("state") !== state) {
				res.statusCode = 400;
				res.setHeader("Content-Type", "text/html; charset=utf-8");
				res.end(oauthErrorHtml("State mismatch."));
				return;
			}
			const code = url.searchParams.get("code");
			if (!code) {
				res.statusCode = 400;
				res.setHeader("Content-Type", "text/html; charset=utf-8");
				res.end(oauthErrorHtml("Missing authorization code."));
				return;
			}
			res.statusCode = 200;
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.end(oauthSuccessHtml("OpenAI authentication completed. You can close this window."));
			settleWait?.({ code });
		} catch {
			res.statusCode = 500;
			res.setHeader("Content-Type", "text/html; charset=utf-8");
			res.end(oauthErrorHtml("Internal error while processing OAuth callback."));
		}
	});
	return new Promise((resolve) => {
		server.listen(1455, getCallbackHost(), () => {
			resolve({
				close: () => new Promise((resolve) => {
					server.close(() => resolve());
					server.closeAllConnections();
				}),
				cancelWait: () => {
					settleWait?.(null);
				},
				waitForCode: () => waitForCodePromise
			});
		}).on("error", (_err) => {
			settleWait?.(null);
			resolve({
				close: () => {
					try {
						server.close();
					} catch {}
				},
				cancelWait: () => {},
				waitForCode: async () => null
			});
		});
	});
}
function getAccountId(accessToken) {
	const accountId = (decodeJwt(accessToken)?.[JWT_CLAIM_PATH])?.chatgpt_account_id;
	return typeof accountId === "string" && accountId.length > 0 ? accountId : null;
}
function credentialsFromToken(token) {
	const accountId = getAccountId(token.access);
	if (!accountId) throw new Error("Failed to extract accountId from token");
	return {
		type: "oauth",
		access: token.access,
		refresh: token.refresh,
		expires: token.expires,
		accountId
	};
}
async function exchangeAuthorizationCodeForCredentials(code, verifier, redirectUri, signal) {
	return credentialsFromToken(await exchangeAuthorizationCode(code, verifier, redirectUri, signal));
}
async function loginOpenAICodexDeviceCode(interaction) {
	const device = await startOpenAICodexDeviceAuth(interaction.signal);
	interaction.notify({
		type: "device_code",
		userCode: device.userCode,
		verificationUri: DEVICE_VERIFICATION_URI,
		intervalSeconds: device.intervalSeconds,
		expiresInSeconds: DEVICE_CODE_TIMEOUT_SECONDS
	});
	const code = await pollOpenAICodexDeviceAuth(device, interaction.signal);
	return exchangeAuthorizationCodeForCredentials(code.authorizationCode, code.codeVerifier, DEVICE_REDIRECT_URI, interaction.signal);
}
async function loginOpenAICodex$1(interaction) {
	const { verifier, state, url } = await createAuthorizationFlow();
	const server = await startLocalOAuthServer(state);
	const manualAbort = new AbortController();
	const onAbort = () => server.cancelWait();
	interaction.signal.addEventListener("abort", onAbort, { once: true });
	if (interaction.signal.aborted) onAbort();
	let code;
	let manualCode;
	let manualError;
	interaction.notify({
		type: "auth_url",
		url,
		instructions: "A browser window should open. Complete login to finish."
	});
	try {
		const manualPromise = interaction.prompt({
			type: "manual_code",
			message: "Complete login in your browser, or paste the authorization code / redirect URL here:",
			placeholder: REDIRECT_URI,
			signal: manualAbort.signal
		}).then((input) => {
			manualCode = input;
			server.cancelWait();
		}).catch((error) => {
			manualError = error instanceof Error ? error : new Error(String(error));
			server.cancelWait();
		});
		const result = await server.waitForCode();
		if (manualError) throw manualError;
		if (result?.code) code = result.code;
		else if (manualCode) {
			const parsed = parseAuthorizationInput(manualCode);
			if (parsed.state && parsed.state !== state) throw new Error("State mismatch");
			code = parsed.code;
		}
		if (!code) {
			await manualPromise;
			if (manualError) throw manualError;
			if (manualCode) {
				const parsed = parseAuthorizationInput(manualCode);
				if (parsed.state && parsed.state !== state) throw new Error("State mismatch");
				code = parsed.code;
			}
		}
		if (!code) throw new Error("Missing authorization code");
		return exchangeAuthorizationCodeForCredentials(code, verifier, REDIRECT_URI, interaction.signal);
	} finally {
		interaction.signal.removeEventListener("abort", onAbort);
		manualAbort.abort();
		await server.close();
	}
}
/**
* Refresh OpenAI Codex OAuth token
*/
async function refreshOpenAICodexToken(refreshToken, signal) {
	return credentialsFromToken(await refreshAccessToken(refreshToken, signal));
}
const openaiCodexOAuth = {
	name: "OpenAI (ChatGPT Plus/Pro)",
	isSubscription: true,
	async login(interaction) {
		const method = await interaction.prompt({
			type: "select",
			message: "Select OpenAI Codex login method:",
			options: [{
				id: OPENAI_CODEX_BROWSER_LOGIN_METHOD,
				label: "Browser login (default)"
			}, {
				id: OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD,
				label: "Device code login (headless)"
			}]
		});
		if (method === OPENAI_CODEX_DEVICE_CODE_LOGIN_METHOD) return loginOpenAICodexDeviceCode(interaction);
		if (method !== OPENAI_CODEX_BROWSER_LOGIN_METHOD) throw new Error(`Unknown OpenAI Codex login method: ${method}`);
		return loginOpenAICodex$1(interaction);
	},
	refresh: (credential, signal) => refreshOpenAICodexToken(credential.refresh, signal),
	async toAuth(credential) {
		return { apiKey: credential.access };
	}
};
const PUBLIC_MESSAGES = /* @__PURE__ */ new Set([
	...Object.values({
		MISSING_CREDENTIAL: "OpenAI Codex request account is unavailable. Please select an account or sign in again.",
		AUTH_FAILED: "OpenAI Codex operation failed. Please try again.",
		REAUTH_REQUIRED: "OpenAI Codex authorization must be renewed",
		ABORTED: "OpenAI Codex request cancelled."
	}),
	"ChatGPT authorization expired. Please sign in again.",
	"OpenAI Codex sign-in cancelled",
	"OpenAI Codex plugin disposed",
	"openai-codex: account not found",
	"openai-codex: replacement account not found",
	"openai-codex: removing the active account requires replacementAccountKey",
	"openai-codex: replacementAccountKey is only valid when removing the active account"
]);
/** Return a bounded diagnostic from a closed vocabulary, never upstream response text. */
function publicAuthError(error) {
	const message = error instanceof Error ? error.message : "";
	if (PUBLIC_MESSAGES.has(message)) return message;
	if (/^OpenAI Codex usage request failed with HTTP [1-5][0-9]{2}$/u.test(message)) return message;
	return "OpenAI Codex operation failed. Please try again.";
}
//#endregion
//#region src/auth.ts
/**
* OpenAI Codex OAuth orchestration shared by the plugin and standalone launcher.
* @module dsh-codex-connect/auth
*/
/**
* Complete provider-native OAuth and persist the resulting credential.
* @param interaction - terminal or UI callbacks for the provider flow.
* @param store - credential store, defaulting under `$DSH_HOME`.
*/
async function loginOpenAICodex(interaction, store = new OpenAICodexCredentialStore()) {
	const models = createModels({ credentials: store });
	const provider = openaiCodexProvider();
	let login;
	models.setProvider({
		...provider,
		auth: {
			...provider.auth,
			oauth: {
				...openaiCodexOAuth,
				login: (callbacks) => {
					login = openaiCodexOAuth.login(callbacks);
					return login;
				}
			}
		}
	});
	try {
		await models.login(OPENAI_CODEX_PROVIDER, "oauth", interaction);
	} finally {
		await login?.catch(() => void 0);
	}
}
/**
* Remove the stored OpenAI Codex credential.
* @param store - credential store, defaulting under `$DSH_HOME`.
*/
async function logoutOpenAICodex(store = new OpenAICodexCredentialStore()) {
	await store.delete(OPENAI_CODEX_PROVIDER);
}
/**
* Read non-secret OpenAI Codex login state without refreshing the token.
* @param store - credential store, defaulting under `$DSH_HOME`.
* @returns stored login state and expiry.
*/
async function openAICodexAuthStatus(store = new OpenAICodexCredentialStore()) {
	const credential = await store.read(OPENAI_CODEX_PROVIDER);
	return credential?.type === "oauth" ? {
		authenticated: true,
		expiresAt: new Date(credential.expires)
	} : { authenticated: false };
}
/** Backup suffix created beside every changed session artifact. */
const OPENAI_CODEX_HISTORY_BACKUP_SUFFIX = ".pre-codex-search-history-migration";
const ZSTD_MAGIC = 4247762216;
const CHECKSUM_OPTIONS = { params: { [constants$1.ZSTD_c_checksumFlag]: 1 } };
const STABLE_READ_ATTEMPTS = 3;
function scanZstdFrames(buffer) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 4) throw new Error(`incomplete Zstandard frame magic at byte ${offset}`);
		if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`invalid Zstandard frame magic at byte ${offset}`);
		offset += 4;
		if (offset === buffer.length) throw new Error(`incomplete Zstandard frame descriptor at byte ${offset}`);
		const descriptor = buffer.readUInt8(offset);
		offset += 1;
		if ((descriptor & 24) !== 0) throw new Error(`reserved Zstandard frame-header bit at byte ${offset - 1}`);
		const contentSizeFlag = descriptor >>> 6;
		const singleSegment = (descriptor & 32) !== 0;
		const checksum = (descriptor & 4) !== 0;
		const dictionaryFlag = descriptor & 3;
		const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
		const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
		const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
		if (buffer.length - offset < remainingHeaderBytes) throw new Error(`incomplete Zstandard frame header at byte ${start}`);
		offset += remainingHeaderBytes;
		for (;;) {
			if (buffer.length - offset < 3) throw new Error(`incomplete Zstandard block header at byte ${offset}`);
			const blockHeader = buffer.readUIntLE(offset, 3);
			offset += 3;
			const lastBlock = (blockHeader & 1) !== 0;
			const blockType = blockHeader >>> 1 & 3;
			const blockSize = blockHeader >>> 3;
			if (blockType === 3) throw new Error(`reserved Zstandard block type at byte ${offset - 3}`);
			const payloadBytes = blockType === 1 ? 1 : blockSize;
			if (buffer.length - offset < payloadBytes) throw new Error(`incomplete Zstandard block payload at byte ${offset}`);
			offset += payloadBytes;
			if (lastBlock) break;
		}
		if (checksum) {
			if (buffer.length - offset < 4) throw new Error(`incomplete Zstandard checksum at byte ${offset}`);
			offset += 4;
		}
		frames.push({
			start,
			end: offset
		});
	}
	return frames;
}
function markLegacyEventIgnorable(line) {
	let record;
	try {
		record = JSON.parse(line);
	} catch {
		return;
	}
	if (typeof record !== "object" || record === null || Array.isArray(record)) return void 0;
	const event = record;
	if (event["type"] !== "web/openai-codex-search-llm-request" || event["ignorable"] === true) return void 0;
	if (event["ignorable"] !== void 0) throw new Error(`legacy Codex search event seq ${String(event["seq"])} has an unexpected ignorable value`);
	let objectEnd = line.length - 1;
	while (objectEnd >= 0 && /\s/u.test(line[objectEnd] ?? "")) objectEnd -= 1;
	if (line[objectEnd] !== "}") throw new Error(`legacy Codex search event seq ${String(event["seq"])} is not a JSON object`);
	return `${line.slice(0, objectEnd)},"ignorable":true${line.slice(objectEnd)}`;
}
function rewriteFrame(frame) {
	const lines = zstdDecompressSync(frame).toString("utf8").split("\n");
	let changedEvents = 0;
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (line === void 0 || line.length === 0) continue;
		const migrated = markLegacyEventIgnorable(line);
		if (migrated === void 0) continue;
		lines[index] = migrated;
		changedEvents += 1;
	}
	if (changedEvents === 0) return {
		frame,
		changedEvents
	};
	return {
		frame: zstdCompressSync(Buffer.from(lines.join("\n")), CHECKSUM_OPTIONS),
		changedEvents
	};
}
function validateMigration(original, migrated, expectedChanges) {
	const beforeFrames = scanZstdFrames(original);
	const afterFrames = scanZstdFrames(migrated);
	if (beforeFrames.length !== afterFrames.length) throw new Error("Zstandard frame count changed during migration");
	let changes = 0;
	for (let index = 0; index < beforeFrames.length; index += 1) {
		const beforeRange = beforeFrames[index];
		const afterRange = afterFrames[index];
		if (beforeRange === void 0 || afterRange === void 0) throw new Error("missing Zstandard frame during validation");
		const beforeLines = zstdDecompressSync(original.subarray(beforeRange.start, beforeRange.end)).toString("utf8").split("\n");
		const afterLines = zstdDecompressSync(migrated.subarray(afterRange.start, afterRange.end)).toString("utf8").split("\n");
		if (beforeLines.length !== afterLines.length) throw new Error(`logical line count changed in frame ${index}`);
		for (let line = 0; line < beforeLines.length; line += 1) {
			if (beforeLines[line] === afterLines[line]) continue;
			const expected = markLegacyEventIgnorable(beforeLines[line] ?? "");
			if (expected === void 0) throw new Error(`non-target record changed in frame ${index}, line ${line + 1}`);
			if (afterLines[line] !== expected) throw new Error(`legacy event changed beyond its ignorable marker in frame ${index}, line ${line + 1}`);
			changes += 1;
		}
	}
	if (changes !== expectedChanges) throw new Error(`validated ${changes} changes, expected ${expectedChanges}`);
}
function revision(metadata) {
	return [
		metadata.dev,
		metadata.ino,
		metadata.size,
		metadata.mtimeNs,
		metadata.ctimeNs
	].join(":");
}
async function readStableFile(path) {
	for (let attempt = 0; attempt < STABLE_READ_ATTEMPTS; attempt += 1) {
		const before = revision(await stat(path, { bigint: true }));
		const content = await readFile(path);
		if (before === revision(await stat(path, { bigint: true }))) return content;
	}
	throw new Error(`session kept changing during ${STABLE_READ_ATTEMPTS} stable-read attempts: ${path}`);
}
function renderMigration(original) {
	const frames = scanZstdFrames(original);
	const output = [];
	let changedEvents = 0;
	for (const frame of frames) {
		const rewritten = rewriteFrame(original.subarray(frame.start, frame.end));
		output.push(rewritten.frame);
		changedEvents += rewritten.changedEvents;
	}
	const migrated = Buffer.concat(output);
	if (changedEvents > 0) validateMigration(original, migrated, changedEvents);
	return {
		migrated,
		changedEvents
	};
}
async function* sessionArtifacts(root) {
	const pending = [root];
	while (pending.length > 0) {
		const current = pending.pop();
		if (current === void 0) continue;
		let entries;
		try {
			entries = await readdir(current, { withFileTypes: true });
		} catch (error) {
			if (error.code === "ENOENT") continue;
			throw error;
		}
		for (const entry of entries) {
			const path = join(current, entry.name);
			if (entry.isDirectory()) pending.push(path);
			else if (entry.isFile() && entry.name === "session.jsonl.zstd") yield path;
		}
	}
}
async function syncParentDirectory(path) {
	const directory = await open(dirname(path), "r");
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}
async function migrateArtifact(path, apply) {
	if (!apply) {
		const { changedEvents } = renderMigration(await readStableFile(path));
		return changedEvents === 0 ? void 0 : {
			path,
			changedEvents
		};
	}
	return withFileLock(path, async () => {
		const original = await readStableFile(path);
		const { migrated, changedEvents } = renderMigration(original);
		if (changedEvents === 0) return void 0;
		const metadata = await stat(path);
		const sourceIdentity = await stat(path, { bigint: true });
		const backupPath = path + OPENAI_CODEX_HISTORY_BACKUP_SUFFIX;
		try {
			await link(path, backupPath);
		} catch (error) {
			if (error.code !== "EEXIST") throw error;
		}
		const backupHandle = await open(backupPath, constants.O_RDONLY | constants.O_NOFOLLOW);
		try {
			const backupIdentity = await backupHandle.stat({ bigint: true });
			if (!backupIdentity.isFile()) throw new Error(`migration backup path is not a regular file: ${backupPath}`);
			if (backupIdentity.dev !== sourceIdentity.dev || backupIdentity.ino !== sourceIdentity.ino) throw new Error(`migration backup does not reference the current Session artifact: ${backupPath}`);
			if (!(await backupHandle.readFile()).equals(original)) throw new Error(`migration backup already exists with different content: ${backupPath}`);
			await backupHandle.sync();
		} finally {
			await backupHandle.close();
		}
		await syncParentDirectory(backupPath);
		const temporary = `${path}.codex-search-history-${randomBytes(6).toString("hex")}.tmp`;
		try {
			await writeFile(temporary, migrated, {
				flag: "wx",
				mode: metadata.mode & 511
			});
			const handle = await open(temporary, "r");
			try {
				await handle.sync();
			} finally {
				await handle.close();
			}
			if (!(await readStableFile(path)).equals(original)) throw new Error(`session changed while migration was prepared: ${path}`);
			await rename(temporary, path);
			try {
				await syncParentDirectory(path);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`session was repaired and backed up at ${backupPath}, but synchronizing its directory failed: ${message}`, { cause: error });
			}
			if (!(await readStableFile(backupPath)).equals(original)) throw new Error(`a Session writer changed the preserved backup during migration; stop DSH and restore ${backupPath}`);
		} finally {
			await rm(temporary, { force: true });
		}
		return {
			path,
			changedEvents,
			backupPath
		};
	});
}
/**
* Mark the retired Alpha 4.10 search event ignorable in compressed JSONL logs.
* Applying is an offline maintenance operation and fails closed without the
* caller's explicit acknowledgement that all DSH writers are stopped.
*/
async function migrateOpenAICodexSearchHistory(options = {}) {
	const apply = options.apply === true;
	if (apply && options.confirmStopped !== true) throw new Error("refusing to rewrite Session history without confirmStopped=true after stopping every DSH writer");
	if (apply && process.platform === "win32") throw new Error("applying this history migration is not supported on Windows; dry-run only");
	const root = resolve(options.root ?? join(resolveDshHome(options.dshHome), "sessions"));
	const files = [];
	for await (const path of sessionArtifacts(root)) try {
		const result = await migrateArtifact(path, apply);
		if (result !== void 0) files.push(result);
	} catch (error) {
		const partial = apply && files.length > 0 ? `; ${files.length} earlier file(s) were already repaired and remain backed up` : "";
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Codex search history migration failed at ${path}${partial}: ${message}`, { cause: error });
	}
	return {
		mode: apply ? "apply" : "dry-run",
		root,
		changedFiles: files.length,
		changedEvents: files.reduce((sum, file) => sum + file.changedEvents, 0),
		files
	};
}
//#endregion
//#region src/trusted-origins.ts
/** Owner-only allowlist for browser origins that may reach the Web OAuth routes. */
/** Basename of the DSH-home-scoped browser-origin allowlist. */
const OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME = ".openai-codex-trusted-origins.json";
/** Only supported policy mode; a future mode must not be silently accepted. */
const TRUSTED_ORIGINS_MODE = "allowlist";
/** Whether a filesystem error reports an absent path. */
function isENOENT(error) {
	return error?.code === "ENOENT";
}
/** Reject a sidecar readable by another POSIX user. */
async function assertOwnerOnly(filename) {
	let metadata;
	try {
		metadata = await lstat(filename);
	} catch (error) {
		if (isENOENT(error)) return;
		throw error;
	}
	if (!metadata.isFile()) throw new Error(`openai-codex: ${filename} is not a regular file`);
	/* v8 ignore next -- native Windows coverage takes the mode-less branch */
	if (process.platform === "win32") return;
	/* v8 ignore start -- POSIX tests cover this branch; Windows cannot express it */
	if ((metadata.mode & 63) !== 0) throw new Error(`openai-codex: ${filename} is readable beyond its owner (mode ${(metadata.mode & 511).toString(8)}); run "chmod 600 ${filename}" before starting again`);
	/* v8 ignore stop */
}
/** Reject malformed input without echoing its contents into an error. */
function parseDocument(text, filename) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error(`openai-codex: ${filename} is not valid JSON`);
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`openai-codex: ${filename} must contain an object`);
	const document = value;
	if (Object.keys(document).some((key) => ![
		"version",
		"mode",
		"origins"
	].includes(key))) throw new Error(`openai-codex: ${filename} contains an unknown top-level field`);
	if (document["version"] !== 1) throw new Error(`openai-codex: ${filename} has unsupported trusted-origins format version ${String(document["version"])}`);
	if (document["mode"] !== "allowlist") throw new Error(`openai-codex: ${filename} has unsupported trusted-origins mode`);
	const rawOrigins = document["origins"];
	if (!Array.isArray(rawOrigins)) throw new Error(`openai-codex: ${filename} origins must be an array`);
	const origins = /* @__PURE__ */ new Set();
	for (const rawOrigin of rawOrigins) {
		if (typeof rawOrigin !== "string") throw new Error(`openai-codex: ${filename} origins must contain strings`);
		try {
			origins.add(normalizeTrustedOrigin(rawOrigin));
		} catch {
			throw new Error(`openai-codex: ${filename} contains an invalid trusted origin`);
		}
	}
	return {
		version: 1,
		mode: TRUSTED_ORIGINS_MODE,
		origins: [...origins].sort()
	};
}
/**
* Normalize one exact browser origin.
*
* Only HTTP(S) origins are accepted. Credentials, non-root paths, queries,
* fragments, wildcards, and CIDR-looking host paths are rejected. WHATWG URL
* normalization lowercases the scheme/host and removes default ports.
*/
function normalizeTrustedOrigin(rawOrigin) {
	if (typeof rawOrigin !== "string" || rawOrigin.length === 0 || rawOrigin.trim() !== rawOrigin) throw new Error("trusted origin must be a non-empty URL without surrounding whitespace");
	let origin;
	try {
		origin = new URL(rawOrigin);
	} catch {
		throw new Error("trusted origin must be a valid URL");
	}
	if (origin.protocol !== "http:" && origin.protocol !== "https:") throw new Error("trusted origin protocol must be http or https");
	if (origin.username !== "" || origin.password !== "") throw new Error("trusted origin must not contain credentials");
	if (origin.pathname !== "/" || origin.search !== "" || origin.hash !== "") throw new Error("trusted origin must not contain a path, query, or fragment");
	if (origin.hostname === "" || origin.hostname.includes("*")) throw new Error("trusted origin host must be exact");
	if (origin.pathname !== "/" || /(?:^|\/)\d+\/\d+$/u.test(rawOrigin)) throw new Error("trusted origin must not be a CIDR or path");
	if (origin.origin === "null") throw new Error("trusted origin must have an HTTP(S) host");
	return origin.origin;
}
/** Resolve the sidecar path under one DSH home. */
function openAICodexTrustedOriginsPath(dshHome) {
	return resolve(join(resolveDshHome(dshHome), OPENAI_CODEX_TRUSTED_ORIGINS_FILENAME));
}
/** File-backed exact-origin allowlist. */
var OpenAICodexTrustedOriginsStore = class {
	/** Absolute sidecar path. */
	filename;
	constructor(filename = openAICodexTrustedOriginsPath()) {
		this.filename = resolve(filename);
	}
	async readCurrent() {
		await assertOwnerOnly(this.filename);
		let text;
		try {
			text = await readFile(this.filename, "utf8");
		} catch (error) {
			if (isENOENT(error)) return {
				version: 1,
				mode: TRUSTED_ORIGINS_MODE,
				origins: []
			};
			throw error;
		}
		return parseDocument(text, this.filename);
	}
	/** Read the current canonical list without acquiring the writer lock. */
	async list() {
		return [...(await this.readCurrent()).origins];
	}
	/** Whether an exact normalized origin is currently trusted. */
	async has(origin) {
		const normalized = normalizeTrustedOrigin(origin);
		return (await this.readCurrent()).origins.includes(normalized);
	}
	/** Add one origin idempotently and return the resulting sorted list. */
	async trust(origin) {
		const normalized = normalizeTrustedOrigin(origin);
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.filename, async () => {
			const current = await this.readCurrent();
			if (current.origins.includes(normalized)) return [...current.origins];
			const next = {
				version: 1,
				mode: TRUSTED_ORIGINS_MODE,
				origins: [...current.origins, normalized].sort()
			};
			await writeFileAtomic(this.filename, `${JSON.stringify(next, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return [...next.origins];
		});
	}
	/** Remove one origin idempotently and return the resulting sorted list. */
	async untrust(origin) {
		const normalized = normalizeTrustedOrigin(origin);
		await mkdir(dirname(this.filename), {
			recursive: true,
			mode: 448
		});
		return withFileLock(this.filename, async () => {
			const current = await this.readCurrent();
			if (!current.origins.includes(normalized)) return [...current.origins];
			const next = {
				version: 1,
				mode: TRUSTED_ORIGINS_MODE,
				origins: current.origins.filter((candidate) => candidate !== normalized)
			};
			await writeFileAtomic(this.filename, `${JSON.stringify(next, null, 2)}\n`, {
				mode: 384,
				dirMode: 448
			});
			return [...next.origins];
		});
	}
};
//#endregion
//#region src/model-contract.ts
const CONFIGURATION_LIMITS = Object.freeze({
	"gpt-6-astra": 872e3,
	"gpt-6-sol": 872e3,
	"gpt-6-luna": 872e3,
	"gpt-5.6-sol": 872e3,
	"gpt-5.6-terra": 872e3,
	"gpt-5.6-luna": 872e3,
	"gpt-5.4": 1e6,
	"gpt-5.5": 272e3,
	"gpt-5.4-mini": 272e3
});
/** Keep unlisted or newer provider defaults usable without inventing a larger limit. */
function openAICodexContextLimit(id, contextWindow) {
	const ceiling = Object.hasOwn(CONFIGURATION_LIMITS, id) ? CONFIGURATION_LIMITS[id] : void 0;
	return ceiling === void 0 || ceiling < contextWindow ? {
		maxContextWindow: contextWindow,
		contextLimitSource: "catalog-default"
	} : {
		maxContextWindow: ceiling,
		contextLimitSource: "codex-catalog"
	};
}
const OPENAI_CODEX_ASTRA_MODEL = {
	id: "gpt-6-astra",
	name: "GPT-6-Astra",
	api: "openai-codex-responses",
	provider: OPENAI_CODEX_PROVIDER,
	baseUrl: "https://chatgpt.com/backend-api",
	reasoning: true,
	input: ["text", "image"],
	cost: {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0
	},
	contextWindow: 272e3,
	maxTokens: 128e3,
	thinkingLevelMap: {
		off: null,
		minimal: null,
		xhigh: "xhigh",
		max: "max"
	},
	compat: {
		supportsOpenAIGrammarTools: true,
		supportsAdditionalTools: true,
		supportsToolSearch: true
	}
};
/** Preserve native Astra metadata with calibrated effort choices, or add the fallback. */
function withOpenAICodexAstra(provider) {
	const baseline = provider.getModels();
	const models = baseline.some((model) => model.id === "gpt-6-astra") ? baseline.map((model) => model.id === "gpt-6-astra" ? {
		...model,
		thinkingLevelMap: {
			...model.thinkingLevelMap,
			...OPENAI_CODEX_ASTRA_MODEL.thinkingLevelMap
		}
	} : model) : [OPENAI_CODEX_ASTRA_MODEL, ...baseline];
	return {
		...provider,
		getModels: () => models
	};
}
/** Missing Codex catalog entries; never replace upstream capacity, pricing or capabilities. */
function withOpenAICodexModels(provider) {
	const baseline = withOpenAICodexAstra(provider);
	const models = [...baseline.getModels()];
	for (const [id, name] of [["gpt-6-sol", "GPT-6-Sol"], ["gpt-6-luna", "GPT-6-Luna"]]) {
		const index = models.findIndex((model) => model.id === id);
		const thinkingLevelMap = {
			off: null,
			minimal: null,
			xhigh: "xhigh",
			max: "max"
		};
		if (index === -1) models.push({
			...OPENAI_CODEX_ASTRA_MODEL,
			id,
			name,
			thinkingLevelMap
		});
		else models[index] = {
			...models[index],
			thinkingLevelMap: {
				...models[index].thinkingLevelMap,
				...thinkingLevelMap
			}
		};
	}
	return {
		...baseline,
		getModels: () => models
	};
}
/** Return a detached copy of the effective Codex model catalog. */
function openAICodexModelCatalog() {
	return withOpenAICodexModels(openaiCodexProvider()).getModels().map((model) => ({
		id: model.id,
		name: model.name,
		contextWindow: model.contextWindow,
		...openAICodexContextLimit(model.id, model.contextWindow)
	}));
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+cosmokit@1.8.5/node_modules/@deepseek-ai/cosmokit/lib/index.js
/** Return true when a value is `null` or `undefined`. */
function isNullable(value) {
	return value === null || value === void 0;
}
/** Return true for non-array object values. */
function isPlainObject(data) {
	return data && typeof data === "object" && !Array.isArray(data);
}
/** Filter object entries and return a new object. */
function filterKeys(object, filter) {
	return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
/** Map object values while preserving the original key set. */
function mapValues(object, transform) {
	return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
/** Pick selected keys from an object, optionally including `undefined` values. */
function pick(source, keys, forced) {
	if (!keys) return { ...source };
	const result = {};
	for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
	return result;
}
/** Define a non-enumerable writable property and return the object. */
function defineProperty(object, key, value) {
	return Object.defineProperty(object, key, {
		writable: true,
		value,
		enumerable: false
	});
}
/** Shared config references used by schema validators and plugin runtimes. */
const write = Symbol.for("cosmokit.volatile.write");
function snapshot(value, ancestors = /* @__PURE__ */ new Set()) {
	if (typeof value === "function") throw new TypeError("volatile config cannot contain functions");
	if (value === null || typeof value !== "object") return value;
	if (ancestors.has(value)) throw new TypeError("volatile config cannot contain cycles");
	ancestors.add(value);
	try {
		if (Array.isArray(value)) return Object.freeze(value.map((item) => snapshot(item, ancestors)));
		if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("volatile config objects must be plain objects or arrays");
		return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item, ancestors)])));
	} finally {
		ancestors.delete(value);
	}
}
/**
* Create a detached reference containing an immutable copy of the supplied data.
* @param value - validated config data; class instances and functions are unsupported.
* @returns a reference whose value is updated only by its owning runtime.
*/
function createVolatile(value) {
	let current = snapshot(value);
	return Object.freeze({
		get: () => current,
		[write]: (value) => {
			current = value;
		}
	});
}
/**
* Identify references across ESM/CJS copies of the shared library.
* @param value - a parsed config value.
* @returns whether the value implements the shared reference protocol.
*/
function isVolatile(value) {
	return typeof value === "object" && value !== null && write in value;
}
/** Test values using `instanceof` with a `toStringTag` fallback. */
function is(type, value) {
	if (arguments.length === 1) return (value) => is(type, value);
	return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
	return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
	return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
/** Binary source detection and base64/hex conversion helpers. */
var Binary;
(function(Binary) {
	Binary.is = isArrayBufferLike;
	Binary.isSource = isArrayBufferSource;
	function fromSource(source) {
		if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
		else return source;
	}
	Binary.fromSource = fromSource;
	function toBase64(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
		let binary = "";
		const bytes = new Uint8Array(source);
		for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
		return btoa(binary);
	}
	Binary.toBase64 = toBase64;
	function fromBase64(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
		return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
	}
	Binary.fromBase64 = fromBase64;
	function toHex(source) {
		source = fromSource(source);
		if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
		return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
	}
	Binary.toHex = toHex;
	function fromHex(source) {
		if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
		const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
		const buffer = [];
		for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
		return Uint8Array.from(buffer).buffer;
	}
	Binary.fromHex = fromHex;
})(Binary || (Binary = {}));
Binary.fromBase64;
Binary.toBase64;
Binary.fromHex;
Binary.toHex;
/** Deep-clone common JavaScript values while preserving prototypes and cycles. */
function clone(source, refs = /* @__PURE__ */ new Map()) {
	if (!source || typeof source !== "object") return source;
	if (is("Date", source)) return new Date(source.valueOf());
	if (is("RegExp", source)) return new RegExp(source.source, source.flags);
	if (isArrayBufferLike(source)) return source.slice(0);
	if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
	const cached = refs.get(source);
	if (cached) return cached;
	if (Array.isArray(source)) {
		const result = [];
		refs.set(source, result);
		source.forEach((value, index) => {
			result[index] = Reflect.apply(clone, null, [value, refs]);
		});
		return result;
	}
	const result = Object.create(Object.getPrototypeOf(source));
	refs.set(source, result);
	for (const key of Reflect.ownKeys(source)) {
		const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
		if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
		Reflect.defineProperty(result, key, descriptor);
	}
	return result;
}
/**
* Compare values recursively, treating two volatile references as equal regardless of value.
* Strict comparison distinguishes null/undefined, treats opaque objects by identity,
* compares URLs by normalized href, treats array holes as undefined, and considers distinct cyclic structures unequal.
* @param a - first value.
* @param b - second value.
* @param strict - whether to require strict data equality outside volatile references.
* @returns whether the values compare equal.
*/
function deepEqual(a, b, strict) {
	const ancestors = /* @__PURE__ */ new Set();
	function compare(a, b) {
		if (a === b) return true;
		if (isVolatile(a) || isVolatile(b)) return isVolatile(a) && isVolatile(b);
		if (!strict && isNullable(a) && isNullable(b)) return true;
		if (typeof a !== typeof b || typeof a !== "object" || !a || !b) return false;
		if (ancestors.has(a)) return false;
		function check(test, then) {
			return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
		}
		ancestors.add(a);
		try {
			return check(Array.isArray, (a, b) => {
				if (a.length !== b.length) return false;
				for (let index = 0; index < a.length; index++) if (!compare(a[index], b[index])) return false;
				return true;
			}) ?? check(is("Date"), (a, b) => a.valueOf() === b.valueOf()) ?? check(is("URL"), (a, b) => a.href === b.href) ?? check(is("RegExp"), (a, b) => a.source === b.source && a.flags === b.flags) ?? check(isArrayBufferLike, (a, b) => {
				if (a.byteLength !== b.byteLength) return false;
				const viewA = new Uint8Array(a);
				const viewB = new Uint8Array(b);
				for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
				return true;
			}) ?? ((!strict || [a, b].every((value) => Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) && Object.keys({
				...a,
				...b
			}).every((key) => compare(a[key], b[key])));
		} finally {
			ancestors.delete(a);
		}
	}
	return compare(a, b);
}
function tokenize(source, delimiters, delimiter) {
	const output = [];
	let state = 0;
	for (let i = 0; i < source.length; i++) {
		const code = source.charCodeAt(i);
		if (code >= 65 && code <= 90) {
			if (state === 1) {
				const next = source.charCodeAt(i + 1);
				if (next >= 97 && next <= 122) output.push(delimiter);
				output.push(code + 32);
			} else {
				if (state !== 0) output.push(delimiter);
				output.push(code + 32);
			}
			state = 1;
		} else if (code >= 97 && code <= 122) {
			output.push(code);
			state = 2;
		} else if (delimiters.includes(code)) {
			if (state !== 0) output.push(delimiter);
			state = 0;
		} else output.push(code);
	}
	return String.fromCharCode(...output);
}
/** Convert text to dash-delimited parameter case. */
function paramCase(source) {
	return tokenize(source, [45, 95], 45);
}
/** Runtime alias for `paramCase`. */
const hyphenate = paramCase;
/** Time constants plus parsing and formatting helpers. */
var Time;
(function(Time) {
	Time.millisecond = 1;
	Time.second = 1e3;
	Time.minute = Time.second * 60;
	Time.hour = Time.minute * 60;
	Time.day = Time.hour * 24;
	Time.week = Time.day * 7;
	let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
	function setTimezoneOffset(offset) {
		timezoneOffset = offset;
	}
	Time.setTimezoneOffset = setTimezoneOffset;
	function getTimezoneOffset() {
		return timezoneOffset;
	}
	Time.getTimezoneOffset = getTimezoneOffset;
	function getDateNumber(date = /* @__PURE__ */ new Date(), offset) {
		if (typeof date === "number") date = new Date(date);
		if (offset === void 0) offset = timezoneOffset;
		return Math.floor((date.valueOf() / Time.minute - offset) / 1440);
	}
	Time.getDateNumber = getDateNumber;
	function fromDateNumber(value, offset) {
		const date = new Date(value * Time.day);
		if (offset === void 0) offset = timezoneOffset;
		return new Date(+date + offset * Time.minute);
	}
	Time.fromDateNumber = fromDateNumber;
	const numeric = /\d+(?:\.\d+)?/.source;
	const timeRegExp = new RegExp(`^${[
		"w(?:eek(?:s)?)?",
		"d(?:ay(?:s)?)?",
		"h(?:our(?:s)?)?",
		"m(?:in(?:ute)?(?:s)?)?",
		"s(?:ec(?:ond)?(?:s)?)?"
	].map((unit) => `(${numeric}${unit})?`).join("")}$`);
	function parseTime(source) {
		const capture = timeRegExp.exec(source);
		if (!capture) return 0;
		return (parseFloat(capture[1]) * Time.week || 0) + (parseFloat(capture[2]) * Time.day || 0) + (parseFloat(capture[3]) * Time.hour || 0) + (parseFloat(capture[4]) * Time.minute || 0) + (parseFloat(capture[5]) * Time.second || 0);
	}
	Time.parseTime = parseTime;
	function parseDate(date) {
		const parsed = parseTime(date);
		if (parsed) date = Date.now() + parsed;
		else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date}`;
		else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date)) date = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date}`;
		return date ? new Date(date) : /* @__PURE__ */ new Date();
	}
	Time.parseDate = parseDate;
	function format(ms) {
		const abs = Math.abs(ms);
		if (abs >= Time.day - Time.hour / 2) return Math.round(ms / Time.day) + "d";
		else if (abs >= Time.hour - Time.minute / 2) return Math.round(ms / Time.hour) + "h";
		else if (abs >= Time.minute - Time.second / 2) return Math.round(ms / Time.minute) + "m";
		else if (abs >= Time.second) return Math.round(ms / Time.second) + "s";
		return ms + "ms";
	}
	Time.format = format;
	function toDigits(source, length = 2) {
		return source.toString().padStart(length, "0");
	}
	Time.toDigits = toDigits;
	function template(template, time = /* @__PURE__ */ new Date()) {
		return template.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
	}
	Time.template = template;
})(Time || (Time = {}));
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+cordis@4.0.4_@deepseek-ai+cordis-plugin-include@1.0.9_@deepseek-ai+cordis-plugin-loader@1.0.5/node_modules/@deepseek-ai/cordis/lib/index.js
/** Ordered collection of disposable values with O(1) deletion by value. */
var DisposableList = class {
	sn = 0;
	map = /* @__PURE__ */ new Map();
	weak = /* @__PURE__ */ new WeakMap();
	get length() {
		return this.map.size;
	}
	push(value) {
		const sn = ++this.sn;
		this.map.set(sn, value);
		this.weak.set(value, sn);
		return () => this.map.delete(sn);
	}
	delete(value) {
		const sn = this.weak.get(value);
		if (!sn) return false;
		return this.map.delete(sn);
	}
	clear() {
		const values = [...this.map.values()];
		this.map.clear();
		return values.reverse();
	}
	[Symbol.iterator]() {
		return this.map.values();
	}
	[Symbol.for("nodejs.util.inspect.custom")]() {
		return [...this];
	}
};
/** Shared symbols used to avoid public property-name collisions. */
const symbols = {
	shadow: Symbol.for("cordis.shadow"),
	receiver: Symbol.for("cordis.receiver"),
	original: Symbol.for("cordis.original"),
	metadata: Symbol.for("cordis.metadata"),
	initHooks: Symbol.for("cordis.initHooks"),
	checkProto: Symbol.for("cordis.checkProto"),
	effect: Symbol.for("cordis.effect"),
	filter: Symbol.for("cordis.filter"),
	isolate: Symbol.for("cordis.isolate"),
	intercept: Symbol.for("cordis.intercept"),
	init: Symbol.for("cordis.init"),
	check: Symbol.for("cordis.check"),
	config: Symbol.for("cordis.config"),
	invoke: Symbol.for("cordis.invoke"),
	extend: Symbol.for("cordis.extend"),
	tracker: Symbol.for("cordis.tracker"),
	resolveConfig: Symbol.for("cordis.resolveConfig")
};
const GeneratorFunction = function* () {}.constructor;
const AsyncGeneratorFunction = async function* () {}.constructor;
/** Return true when a plugin callback should be constructed with `new`. */
function isConstructor(func) {
	if (!func.prototype) return false;
	if (func instanceof GeneratorFunction) return false;
	if (AsyncGeneratorFunction !== Function && func instanceof AsyncGeneratorFunction) return false;
	return true;
}
/** Merge two prototype chains while preserving descriptors from `proto1`. */
function joinPrototype(proto1, proto2) {
	if (proto1 === Object.prototype) return proto2;
	const result = Object.create(joinPrototype(Object.getPrototypeOf(proto1), proto2));
	for (const key of Reflect.ownKeys(proto1)) Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(proto1, key));
	return result;
}
/** Return true for non-null objects and functions. */
function isObject(value) {
	return value && (typeof value === "object" || typeof value === "function");
}
/** Find a property descriptor by walking an object's prototype chain. */
function getPropertyDescriptor(target, prop) {
	let proto = target;
	while (proto) {
		const desc = Reflect.getOwnPropertyDescriptor(proto, prop);
		if (desc) return desc;
		proto = Object.getPrototypeOf(proto);
	}
}
/** Wrap services/functions so method calls see the caller's active context. */
function getTraceable(ctx, value) {
	if (!isObject(value)) return value;
	if (Object.hasOwn(value, symbols.shadow)) return Object.getPrototypeOf(value);
	const tracker = value[symbols.tracker];
	if (!tracker) return value;
	return createTraceable(ctx, value, tracker);
}
/** Return a proxy that overlays readonly or writable properties onto a target. */
function withProps(target, props) {
	if (!props) return target;
	return new Proxy(target, {
		get: (target, prop, receiver) => {
			if (prop in props && prop !== "constructor") return Reflect.get(props, prop, receiver);
			return Reflect.get(target, prop, receiver);
		},
		set: (target, prop, value, receiver) => {
			if (prop in props && prop !== "constructor") return Reflect.set(props, prop, value, receiver);
			return Reflect.set(target, prop, value, receiver);
		}
	});
}
function withProp(target, prop, value) {
	return withProps(target, Object.defineProperty(Object.create(null), prop, {
		value,
		writable: false
	}));
}
function createShadow(ctx, target, property, receiver) {
	if (!property) return receiver;
	const origin = Reflect.getOwnPropertyDescriptor(target, property)?.value;
	if (!origin) return receiver;
	return withProp(receiver, property, ctx.extend({ [symbols.shadow]: origin }));
}
function createShadowMethod(ctx, value, outer, shadow) {
	return new Proxy(value, { apply: (target, thisArg, args) => {
		if (thisArg === outer) thisArg = shadow;
		return getTraceable(ctx, Reflect.apply(target, thisArg, args));
	} });
}
function createTraceable(ctx, value, tracker) {
	if (ctx[symbols.shadow] && !tracker.noShadow) ctx = Object.getPrototypeOf(ctx);
	const proxy = new Proxy(value, {
		get: (target, prop, receiver) => {
			if (prop === symbols.original) return target;
			if (prop === tracker.property) return ctx;
			if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
			if (tracker.associate && ctx.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.get(ctx, `${tracker.associate}.${prop}`, withProp(ctx, symbols.receiver, receiver));
			let shadow, innerValue;
			const desc = getPropertyDescriptor(target, prop);
			if (desc && "value" in desc) innerValue = desc.value;
			else {
				shadow = createShadow(ctx, target, tracker.property, receiver);
				innerValue = Reflect.get(target, prop, shadow);
			}
			const innerTracker = innerValue?.[symbols.tracker];
			if (innerTracker) return createTraceable(ctx, innerValue, innerTracker);
			else if (!tracker.noShadow && typeof innerValue === "function") {
				shadow ??= createShadow(ctx, target, tracker.property, receiver);
				return createShadowMethod(ctx, innerValue, receiver, shadow);
			} else return innerValue;
		},
		set: (target, prop, value, receiver) => {
			if (prop === symbols.original) return false;
			if (prop === tracker.property) return false;
			if (typeof prop === "symbol") return Reflect.set(target, prop, value, receiver);
			if (tracker.associate && ctx.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.set(ctx, `${tracker.associate}.${prop}`, value, withProp(ctx, symbols.receiver, receiver));
			const shadow = createShadow(ctx, target, tracker.property, receiver);
			return Reflect.set(target, prop, value, shadow);
		},
		apply: (target, thisArg, args) => {
			return applyTraceable(proxy, target, thisArg, args);
		}
	});
	return proxy;
}
function applyTraceable(proxy, value, thisArg, args) {
	if (!value[symbols.invoke]) return Reflect.apply(value, thisArg, args);
	return value[symbols.invoke].apply(proxy, args);
}
/** Create a callable service object that dispatches through `symbols.invoke`. */
function createCallable(name, proto, tracker) {
	const self = function(...args) {
		return applyTraceable(createTraceable(self["ctx"], self, tracker), self, this, args);
	};
	defineProperty(self, "name", name);
	return Object.setPrototypeOf(self, proto);
}
function handleError(info, reason, getOuterStack) {
	const innerLines = info.error.stack.split("\n");
	if (typeof reason?.stack !== "string") {
		const outerError = new Error(reason);
		const lines = outerError.stack.split("\n");
		lines.splice(1, Infinity, ...getOuterStack());
		outerError.stack = lines.join("\n");
		throw outerError;
	}
	const lines = reason.stack.split("\n");
	let index = lines.indexOf(innerLines[2]);
	if (index === -1) throw reason;
	index -= info.offset;
	while (index > 0) {
		if (!lines[index - 1].endsWith(" (<anonymous>)")) break;
		index -= 1;
	}
	lines.splice(index, Infinity, ...getOuterStack());
	reason.stack = lines.join("\n");
	throw reason;
}
/** Run a callback and splice outer call-site frames into thrown async errors. */
function composeError(callback, getOuterStack = buildOuterStack()) {
	const info = {
		offset: 1,
		error: /* @__PURE__ */ new Error()
	};
	try {
		const result = callback(info);
		if (isObject(result) && "then" in result) return result.then(void 0, (reason) => handleError(info, reason, getOuterStack));
		else return result;
	} catch (reason) {
		handleError(info, reason, getOuterStack);
	}
}
/** Capture a lazy stack-frame supplier for later error composition. */
function buildOuterStack(offset = 0) {
	const outerError = /* @__PURE__ */ new Error();
	return () => outerError.stack.split("\n").slice(3 + offset);
}
/**
* Return whether an event result should stop a bail-style dispatch.
*
* @param value — a listener's return value.
* @returns `true` unless `value` is `null`, `false`, or `undefined`.
*/
function isBailed(value) {
	return value !== null && value !== false && value !== void 0;
}
/**
* Event bus installed as `ctx.events` and mixed into every context.
*
* The service supports concurrent, synchronous, serial, bail, and waterfall
* dispatch and automatically disposes listeners with their owning fiber.
*/
var EventsService = class {
	ctx;
	_hooks = {};
	constructor(ctx) {
		this.ctx = ctx;
		defineProperty(this, symbols.tracker, {
			property: "ctx",
			noShadow: true
		});
		this.on("internal/listener", function(name, listener, options) {
			if (name === "internal/update" && !options.global) return (this.fiber._hooks["internal/update"] ??= new DisposableList())[options.prepend ? "unshift" : "push"](listener);
		});
		this.on("internal/update", function(config, noSave, next) {
			const cbs = [...this._hooks["internal/update"] || []];
			const _next = () => {
				return (cbs.shift() ?? next).call(this, config, noSave, _next);
			};
			return _next();
		}, {
			global: true,
			prepend: true
		});
	}
	/**
	* Resolve listeners for one dispatch and apply context filtering.
	*
	* @param type — the dispatch mode, reported on `internal/dispatch`.
	* @param args — the raw dispatch arguments; consumed up to the event name.
	* @returns the matching listener callbacks, bound to the dispatch `this`.
	*/
	dispatch(type, args) {
		const thisArg = typeof args[0] === "object" || typeof args[0] === "function" ? args.shift() : null;
		const name = args.shift();
		if (!name.startsWith("internal/")) this.emit("internal/dispatch", type, name, args, thisArg);
		const filter = thisArg?.[Context.filter];
		return (this._hooks[name] || []).filter((hook) => hook.global || !filter || filter.call(thisArg, hook.ctx)).map((hook) => hook.callback.bind(thisArg));
	}
	/**
	* Run listeners concurrently and wait for all of them.
	*
	* @param args — optional `this`, the event name, then listener arguments.
	* @returns a promise resolving once every listener has settled.
	*/
	async parallel(...args) {
		const errors = (await Promise.allSettled(this.dispatch("emit", args).map(async (cb) => cb(...args)))).filter((result) => result.status === "rejected");
		if (errors.length) throw new AggregateError(errors.map((error) => error.reason));
	}
	/**
	* Run listeners synchronously without waiting for returned promises.
	*
	* @param args — optional `this`, the event name, then listener arguments.
	*/
	emit(...args) {
		this.dispatch("emit", args).map((cb) => cb(...args));
	}
	/**
	* Run listeners in order, awaiting each, until one returns a bail value.
	*
	* @param args — optional `this`, the event name, then listener arguments.
	* @returns the first bail value (see {@link isBailed}), if any.
	*/
	async serial(...args) {
		for (const cb of this.dispatch("serial", args)) {
			const result = await cb(...args);
			if (isBailed(result)) return result;
		}
	}
	/**
	* Run listeners synchronously until one returns a bail value.
	*
	* @param args — optional `this`, the event name, then listener arguments.
	* @returns the first bail value (see {@link isBailed}), if any.
	*/
	bail(...args) {
		for (const cb of this.dispatch("bail", args)) {
			const result = cb(...args);
			if (isBailed(result)) return result;
		}
	}
	/**
	* Compose listeners around the final `next` callback.
	*
	* The last dispatch argument is treated as the innermost `next`. Listeners
	* run outermost-first; a listener that does not call `next()` vetoes the
	* rest of the chain, including the built-in behavior.
	*
	* @param args — optional `this`, the event name, listener arguments, then `next`.
	* @returns the outermost listener's return value.
	*/
	waterfall(...args) {
		const cbs = this.dispatch("waterfall", args);
		const inner = args.pop();
		const next = () => {
			return (cbs.shift() ?? inner)(...args);
		};
		args.push(next);
		return next();
	}
	/**
	* Store a listener record as an effect on the current fiber.
	*
	* @param label — effect label shown in fiber diagnostics.
	* @param hooks — the listener list for one event.
	* @param callback — the listener to store.
	* @param options — placement and filtering options.
	* @returns a disposer that unregisters the listener.
	*/
	register(label, hooks, callback, options) {
		const method = options.prepend ? "unshift" : "push";
		return this.ctx.fiber.effect(() => {
			hooks[method]({
				ctx: this.ctx,
				callback,
				...options
			});
			return () => this.unregister(hooks, callback);
		}, label);
	}
	/**
	* Remove a stored listener record.
	*
	* @param hooks — the listener list for one event.
	* @param callback — the listener to remove.
	* @returns `true` if the listener was found and removed.
	*/
	unregister(hooks, callback) {
		const index = hooks.findIndex((hook) => hook.callback === callback);
		if (index >= 0) {
			hooks.splice(index, 1);
			return true;
		}
	}
	/**
	* Register an event listener owned by the current fiber.
	*
	* The listener is removed automatically when the fiber unloads. Throws
	* `CordisError('INACTIVE_EFFECT')` if the fiber is already disposed.
	*
	* @param name — the event name to listen for.
	* @param listener — called with the dispatch arguments.
	* @param options — listener options; a boolean is shorthand for `prepend`.
	* @returns a disposer removing the listener; `true` if it was still registered.
	*/
	on(name, listener, options) {
		if (typeof options !== "object") options = { prepend: options };
		this.ctx.fiber.assertActive();
		listener = this.ctx.reflect.bind(listener);
		const result = this.bail(this.ctx, "internal/listener", name, listener, options);
		if (result) return result;
		const hooks = this._hooks[name] ||= [];
		const label = `ctx.on(${typeof name === "string" ? JSON.stringify(name) : name.toString()})`;
		return this.register(label, hooks, listener, options);
	}
	/**
	* Register an event listener that disposes itself after the first call.
	*
	* @param name — the event name to listen for.
	* @param listener — called at most once with the dispatch arguments.
	* @param options — listener options; a boolean is shorthand for `prepend`.
	* @returns a disposer removing the listener; `true` if it was still registered.
	*/
	once(name, listener, options) {
		const dispose = this.on(name, function(...args) {
			dispose();
			return listener.apply(this, args);
		}, options);
		return dispose;
	}
};
/** Built-in placeholder formatters used by `Logger.format()`. */
const defaultFormatters = {
	s: (value) => String(value),
	d: (value) => Math.trunc(Number(value)),
	i: (value) => Math.trunc(Number(value)),
	f: (value) => Number(value),
	o: (value) => JSON.stringify(value),
	O: (value) => JSON.stringify(value),
	c: () => "",
	C: (value, exporter, message) => {
		return Logger.color(exporter, Logger.code(message.name, exporter.colors), value);
	}
};
function isAggregateError(error) {
	return error instanceof Error && Array.isArray(error["errors"]);
}
/** Logger facade for one named subsystem. */
var Logger = class {
	service;
	static color(exporter, code, value, decoration = "") {
		if (!exporter.colors) return "" + value;
		return `\u001b[3${code < 8 ? code : "8;5;" + code}${exporter.colors >= 2 ? decoration : ""}m${value}\u001b[0m`;
	}
	static code(name, level) {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = (hash << 3) - hash + name.charCodeAt(i) + 13;
			hash |= 0;
		}
		const colors = !level ? [] : level >= 2 ? c256 : c16;
		return colors[Math.abs(hash) % colors.length];
	}
	static format(exporter, message) {
		const args = message.args.slice();
		if (args[0] instanceof Error) {
			args[0] = args[0].stack || args[0].message;
			args.unshift("%s");
		} else if (typeof args[0] !== "string") args.unshift("%o");
		let format = args.shift();
		format = format.replace(/%([a-zA-Z%])/g, (match, char) => {
			if (match === "%%") return "%";
			const formatter = exporter.formatters?.[char] ?? defaultFormatters[char];
			if (typeof formatter === "function") return formatter(args.shift(), exporter, message);
			return match;
		});
		const oFormatter = exporter.formatters?.o ?? defaultFormatters.o;
		for (let arg of args) {
			if (typeof arg === "object" && arg) arg = oFormatter(arg, exporter, message);
			format += " " + arg;
		}
		const { maxLength = 10240 } = exporter;
		return format.split(/\r?\n/g).map((line) => {
			return line.slice(0, maxLength) + (line.length > maxLength ? "..." : "");
		}).join("\n");
	}
	constructor(options, service) {
		this.service = service;
		Object.assign(this, options);
		this.error = this._method("error", 0);
		this.info = this._method("info", 1);
		this.warn = this._method("warn", 2);
		this.debug = this._method("debug", 3);
	}
	_method(type, level) {
		return (...args) => {
			if (args.length === 1 && args[0] instanceof Error) {
				if (args[0].cause) this[type](args[0].cause);
				else if (isAggregateError(args[0])) {
					args[0].errors.forEach((error) => this[type](error));
					return;
				}
			}
			const sn = ++this.service._snMessage;
			const ts = Date.now();
			for (const exporter of this.service.exporters.values()) {
				if ((exporter.levels?.[this.name] ?? exporter.levels?.default ?? this.level ?? 1) < level) continue;
				const message = {
					sn,
					ts,
					type,
					level,
					name: this.name,
					...this.meta,
					args
				};
				exporter.export(message);
			}
		};
	}
};
/** ANSI 16-color palette indexes used for logger name coloring. */
const c16 = [
	6,
	2,
	3,
	4,
	5,
	1
];
/** ANSI 256-color palette indexes used for logger name coloring. */
const c256 = [
	20,
	21,
	26,
	27,
	32,
	33,
	38,
	39,
	40,
	41,
	42,
	43,
	44,
	45,
	56,
	57,
	62,
	63,
	68,
	69,
	74,
	75,
	76,
	77,
	78,
	79,
	80,
	81,
	92,
	93,
	98,
	99,
	112,
	113,
	129,
	134,
	135,
	148,
	149,
	160,
	161,
	162,
	163,
	164,
	165,
	166,
	167,
	168,
	169,
	170,
	171,
	172,
	173,
	178,
	179,
	184,
	185,
	196,
	197,
	198,
	199,
	200,
	201,
	202,
	203,
	204,
	205,
	206,
	207,
	208,
	209,
	214,
	215,
	220,
	221
];
/**
* Built-in logging service.
*
* Call `ctx.logger()` to create a named logger, or call `ctx.logger.info()`
* directly to log with the current fiber-derived name.
*/
var LoggerService = class LoggerService {
	bufferSize = 1e3;
	buffer = [];
	ctx;
	_snMessage = 0;
	_snExporter = 0;
	exporters = /* @__PURE__ */ new Map();
	constructor(ctx) {
		const tracker = {
			property: "ctx",
			noShadow: true
		};
		const self = createCallable("logger", joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
		Object.assign(self, this);
		self.ctx = ctx;
		defineProperty(self, symbols.tracker, tracker);
		self.exporter({
			colors: 3,
			export: (message) => {
				self.buffer.push(message);
				if (self.buffer.length > self.bufferSize) self.buffer = self.buffer.slice(-self.bufferSize);
			}
		});
		return self;
	}
	/**
	* Register an exporter and dispose it with the current fiber.
	*
	* @param exporter — the sink that receives structured log messages.
	* @returns a disposer that removes the exporter.
	*/
	exporter(exporter) {
		return this.ctx.effect(() => {
			const id = ++this._snExporter;
			this.exporters.set(id, exporter);
			return () => this.exporters.delete(id);
		}, "ctx.logger.exporter()");
	}
	_resolveConfig() {
		let intercept = this.ctx[symbols.intercept];
		const configs = [];
		while ("logger" in intercept) {
			if (Object.hasOwn(intercept, "logger")) configs.unshift(intercept["logger"]);
			intercept = Object.getPrototypeOf(intercept);
		}
		return Object.assign({}, ...configs);
	}
	[symbols.invoke](name) {
		const config = this._resolveConfig();
		const fiber = (this.ctx[symbols.shadow] ?? this.ctx).fiber;
		name ??= config.name;
		name ??= hyphenate(fiber.name);
		return new Logger({
			name,
			level: config.level,
			meta: { fiber: new WeakRef(fiber) }
		}, this);
	}
	static {
		for (const type of [
			"error",
			"info",
			"warn",
			"debug"
		]) LoggerService.prototype[type] = function(...args) {
			return this()[type](...args);
		};
	}
};
function enhanceError(error) {
	const lines = error.stack.split("\n");
	lines.splice(0, 2, `Error: ${error.message}`);
	error.stack = lines.join("\n");
	return error;
}
const RESERVED_WORDS = ["prototype", "then"];
function isSpecialProperty(prop) {
	return typeof prop === "symbol" || RESERVED_WORDS.includes(prop) || parseInt(prop).toString() === prop || prop.startsWith("_");
}
/**
* Reflection and service-resolution layer installed as `ctx.reflect`.
*
* This service powers the context proxy, service registration, accessors, and
* the mixins that expose core service methods directly on `ctx`.
*/
var ReflectService = class {
	ctx;
	/** Proxy traps implementing service resolution for every context object. */
	static handler = {
		get: (target, prop, ctx) => {
			if (isSpecialProperty(prop)) return Reflect.get(target, prop, ctx);
			if (Reflect.has(target, prop)) return getTraceable(ctx, Reflect.get(target, prop, ctx));
			const error = /* @__PURE__ */ new Error(`cannot get property "${prop}" without inject`);
			try {
				const def = target.reflect.props[prop];
				if (def?.type === "accessor") return def.get.call(ctx, ctx[symbols.receiver], error);
				if (!ctx.fiber.runtime) return ctx.reflect.get(prop, false);
				return ctx.events.waterfall("internal/get", ctx, prop, error, () => {
					const key = target[symbols.isolate][prop];
					let fiber = (ctx[symbols.shadow] ?? ctx).fiber;
					while (true) {
						const impl = fiber.store?.[prop];
						if (impl) return getTraceable(ctx, impl.value);
						if (prop in fiber.inject) {
							error.message = `cannot get required service "${prop}" in inactive context`;
							throw error;
						}
						if (!fiber.runtime) throw error;
						if (fiber.parent[symbols.isolate][prop] !== key) throw error;
						fiber = fiber.parent.fiber;
					}
				});
			} catch (e) {
				throw e === error ? enhanceError(e) : e;
			}
		},
		set: (target, prop, value, ctx) => {
			if (isSpecialProperty(prop)) return Reflect.set(target, prop, value, ctx);
			const error = /* @__PURE__ */ new Error(`cannot set property "${prop}" without provide`);
			const def = target.reflect.props[prop];
			if (!def) {
				if (!ctx.fiber.runtime) return Reflect.set(target, prop, value, ctx);
				throw enhanceError(error);
			}
			try {
				if (def.type === "accessor") {
					if (!def.set) return false;
					return def.set.call(ctx, value, ctx[symbols.receiver], error);
				}
				return ctx.events.waterfall("internal/set", ctx, prop, value, error, () => {
					return ctx.reflect.set(prop, value, error);
				});
			} catch (e) {
				throw e === error ? enhanceError(e) : e;
			}
		},
		has: (target, prop) => {
			if (isSpecialProperty(prop)) return Reflect.has(target, prop);
			if (Reflect.has(target, prop)) return true;
			return !!target.reflect.props[prop];
		}
	};
	/** Service implementations, keyed by isolation label. */
	store = Object.create(null);
	/** Declared context properties (services and accessors), by name. */
	props = Object.create(null);
	constructor(ctx) {
		this.ctx = ctx;
		defineProperty(this, symbols.tracker, {
			property: "ctx",
			noShadow: true
		});
		this.mixin("reflect", [
			"get",
			"set",
			"provide",
			"accessor",
			"mixin"
		]);
		this.mixin("fiber", ["runtime", "effect"]);
		this.mixin("registry", ["inject", "plugin"]);
		this.mixin("events", [
			"on",
			"once",
			"parallel",
			"emit",
			"serial",
			"bail",
			"waterfall"
		]);
	}
	/**
	* Read a service from the store without the inject requirement.
	*
	* @param name — the service name.
	* @param strict — when `true`, only return implementations whose providing
	* fiber is currently active.
	* @returns the service value, or `undefined` when not (yet) provided.
	*/
	get(name, strict = true) {
		return getTraceable(this.ctx, this._getImpl(name, strict)?.value);
	}
	_getImpl(name, strict = true) {
		const key = this.ctx[symbols.isolate][name];
		const impl = key && this.store[key];
		if (!impl) return;
		if (strict && impl.fiber.state !== 2) return;
		return impl;
	}
	/**
	* Overwrite a provided service's value.
	*
	* @param name — the service name.
	* @param value — the new service value.
	* @param error — carrier for the caller stack in diagnostics.
	* @returns `true` on success.
	* @throws when `name` was never provided, or was provided by another fiber.
	*/
	set(name, value, error) {
		const key = this.ctx[symbols.isolate][name];
		const impl = this.store[key];
		if (!impl) throw new Error(`cannot set property "${name}" without provide`);
		if (impl.fiber !== this.ctx.fiber) throw new Error(`cannot set property "${name}" in multiple fibers`);
		impl.value = value;
		return true;
	}
	/**
	* Register a service implementation owned by the current fiber.
	*
	* See the `ctx.provide()` overload above for the full contract.
	*
	* @param name — the service name.
	* @param value — the service value.
	* @param check — optional availability predicate for dependents.
	* @returns a disposer that unregisters the service.
	*/
	provide(name, value, check) {
		return this.ctx.fiber.effect(() => {
			if (!this.props[name]) this.props[name] ??= { type: "service" };
			else if (this.props[name].type !== "service") throw new Error(`property "${name}" is already declared as ${this.props[name].type}`);
			this.props[name] = { type: "service" };
			this.ctx.root[symbols.isolate][name] ??= Symbol(name);
			const key = this.ctx[symbols.isolate][name];
			const impl = {
				name,
				value,
				fiber: this.ctx.fiber,
				check
			};
			if (this.store[key]) throw new Error(`service "${name}" has been registered at <${this.store[key].fiber.name}>`);
			this.store[key] = impl;
			this.ctx.fiber.store[name] = impl;
			if (this.ctx.fiber.state === 2) this.notify([name]);
			return async () => {
				delete this.store[key];
				const fibers = this.notify([name]);
				await Promise.allSettled(fibers.map((fiber) => fiber.await()));
				delete this.ctx.fiber.store[name];
			};
		}, `ctx.provide(${JSON.stringify(name)})`);
	}
	/**
	* Re-evaluate every fiber that requires one of the given services.
	*
	* @param names — the service names that changed.
	* @param filter — restricts notification to matching isolation scopes.
	* @returns the fibers whose dependency state was refreshed.
	*/
	notify(names, filter = (ctx, name) => ctx[symbols.isolate][name] === this.ctx[symbols.isolate][name]) {
		const fibers = [];
		for (const runtime of this.ctx.registry.values()) for (const fiber of runtime.fibers) {
			let hasUpdate = false;
			for (const name of names) {
				if (!(name in fiber.inject)) continue;
				if (!filter(fiber.ctx, name)) continue;
				hasUpdate = true;
				fiber._checkImpl(name);
			}
			if (!hasUpdate) continue;
			fiber._refresh();
			fibers.push(fiber);
		}
		for (const name of names) {
			const self = Object.create(this.ctx);
			self[symbols.filter] = (target) => filter(target, name);
			this.ctx.events.emit(self, "internal/service", name, this._getImpl(name, false)?.value);
		}
		return fibers;
	}
	/**
	* Define a computed context property backed by get/set hooks.
	*
	* @param name — the context property name.
	* @param options — the `get` hook and optional `set` hook.
	* @returns a disposer that removes the accessor.
	*/
	accessor(name, options) {
		return this.ctx.fiber.effect(() => {
			if (name in this.props) throw new Error(`property "${name}" is already declared as ${this.props[name].type}`);
			this.props[name] = {
				type: "accessor",
				...options
			};
			return () => delete this.props[name];
		}, `ctx.accessor(${JSON.stringify(name)})`);
	}
	/**
	* Expose selected members of a service directly on `ctx`.
	*
	* See the `ctx.mixin()` overload above for the full contract.
	*
	* @param source — a context property name or a source object.
	* @param mixins — keys to forward, or a source-key → ctx-key map.
	* @returns a disposer that removes all created accessors.
	*/
	mixin(source, mixins) {
		const self = this;
		return this.ctx.fiber.effect(function* () {
			const entries = Array.isArray(mixins) ? mixins.map((key) => [key, key]) : Object.entries(mixins);
			const getTarget = (ctx, error) => {
				return ctx[source];
			};
			for (const [key, value] of entries) yield self.accessor(value, {
				get(receiver, error) {
					const service = getTarget(this, error);
					if (isNullable(service)) return service;
					const mixin = receiver ? withProps(receiver, service) : service;
					const value = Reflect.get(service, key, mixin);
					if (typeof value !== "function") return value;
					return value.bind(mixin ?? service);
				},
				set(value, receiver, error) {
					const service = getTarget(this, error);
					const mixin = receiver ? withProps(receiver, service) : service;
					return Reflect.set(service, key, value, mixin);
				}
			});
		}, `ctx.mixin(${JSON.stringify(source)})`);
	}
	/**
	* Attach this context's tracing wrapper to a value.
	*
	* @param value — the value to wrap.
	* @returns the traceable wrapper (or the value itself when not applicable).
	*/
	trace(value) {
		return getTraceable(this.ctx, value);
	}
	/**
	* Wrap a callback so calls trace `this` and arguments to this context.
	*
	* @param callback — the function to wrap.
	* @returns a proxy delegating to `callback` with traced values.
	*/
	bind(callback) {
		return new Proxy(callback, {
			apply: (target, thisArg, args) => {
				return Reflect.apply(target, this.trace(thisArg), args.map((arg) => this.trace(arg)));
			},
			construct: (target, args, newTarget) => {
				return Reflect.construct(target, args.map((arg) => this.trace(arg)), newTarget);
			}
		});
	}
};
const kValidationError$1 = Symbol.for("ValidationError");
/** Error raised when plugin configuration fails standard-schema validation. */
var ValidationError$1 = class extends TypeError {
	name = "ValidationError";
	/**
	* Build the aggregated message from schema issues.
	*
	* @param issues — the standard-schema issues, one message line each.
	*/
	constructor(issues) {
		super(`invalid config:\n` + issues.map((issue) => {
			if (issue.path) return `  - ${issue.message} (at ${issue.path.join(".")})`;
			else return `  - ${issue.message}`;
		}).join("\n"));
	}
};
Object.defineProperty(ValidationError$1.prototype, kValidationError$1, { value: true });
/**
* Validate and normalize config for a plugin runtime before it starts.
*
* @param runtime — the plugin runtime whose `Config` schema to apply.
* @param config — the raw user config.
* @returns the validated config, or `config` unchanged if the runtime has no schema.
* @throws {ValidationError} when validation reports issues.
*/
function resolveConfig(runtime, config) {
	if (!runtime.Config) return config;
	const result = runtime.Config["~standard"].validate(config);
	if ("then" in result) throw new TypeError("Async config validation is not supported");
	if (result.issues) throw new ValidationError$1(result.issues);
	else return result.value;
}
const effectInertia = /* @__PURE__ */ new WeakMap();
function runDisposable(dispose) {
	const result = dispose();
	return effectInertia.get(dispose)?.() ?? result;
}
/** Notify plugin teardown without allowing one observer to break ownership cleanup. */
function emitPluginDisposed(context, fiber) {
	const args = ["internal/plugin", fiber];
	let callbacks;
	try {
		callbacks = context.events.dispatch("emit", args);
	} catch (error) {
		context.logger.error(error);
		return;
	}
	for (const callback of callbacks) try {
		const returned = callback(...args);
		Promise.resolve(returned).catch((error) => context.logger.error(error));
	} catch (error) {
		context.logger.error(error);
	}
}
/** Framework error with a stable machine-readable code. */
var CordisError = class CordisError extends Error {
	code;
	/**
	* @param code — the stable error code; also the default message.
	* @param message — optional human-readable override.
	*/
	constructor(code, message) {
		super(message ?? CordisError.Code[code]);
		this.code = code;
	}
};
/** Cordis error code definitions. */
(function(CordisError) {
	CordisError.Code = { INACTIVE_EFFECT: "cannot create effect on inactive context" };
})(CordisError || (CordisError = {}));
const INACTIVE = "__INACTIVE__";
/**
* Runtime instance of one plugin application.
*
* A fiber tracks dependency state, validated config, lifecycle effects, and
* cleanup for the plugin context returned by `ctx.plugin()`.
*/
var Fiber = class {
	parent;
	inject;
	runtime;
	/** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
	uid;
	/** The context this fiber's plugin runs in (extends the parent context). */
	ctx;
	/** The validated plugin config (updated by `update()`). */
	config;
	/** The raw plugin config, re-resolved before each activation. */
	_config;
	/** Current lifecycle state; transitions emit `internal/status`. */
	state = 0;
	/** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
	dispose;
	/** Snapshot of required service implementations while loaded; `undefined` otherwise. */
	store;
	/** The in-flight load/unload transition, if one is currently running. */
	inertia;
	_hooks = Object.create(null);
	_disposables = new DisposableList();
	context;
	_error;
	_runner;
	_store = Object.create(null);
	/**
	* Create a fiber. Plugin authors normally obtain fibers from `ctx.plugin()`
	* rather than constructing them directly.
	*
	* @param parent — the context the plugin was loaded from.
	* @param config — raw config, validated against the runtime's schema.
	* @param inject — resolved dependency map (service name → intercept config).
	* @param runtime — the shared plugin runtime, or `null` for the root fiber.
	* @param getOuterStack — captures the caller stack for effect diagnostics.
	*/
	constructor(parent, config, inject, runtime, getOuterStack) {
		this.parent = parent;
		this.inject = inject;
		this.runtime = runtime;
		this._config = config;
		const collect = (dispose) => {
			this._disposables.push(dispose);
		};
		if (runtime) {
			this.uid = parent.registry.counter;
			this.ctx = this.context = parent.extend({ fiber: this });
			const injectEntries = Object.entries(this.inject);
			if (injectEntries.length) {
				this.ctx[Context.intercept] = Object.create(parent[Context.intercept]);
				for (const [name, config] of injectEntries) {
					if (isNullable(config)) continue;
					this.ctx[Context.intercept][name] = config;
				}
			}
			this._runner = {
				epoch: INACTIVE,
				getOuterStack,
				execute: function() {
					if (isConstructor(runtime.callback)) {
						const instance = new runtime.callback(this.ctx, this.config);
						for (const hook of instance?.[symbols.initHooks] ?? []) hook();
						return instance?.[symbols.init]?.();
					} else return runtime.callback(this.ctx, this.config);
				},
				collect
			};
			this.dispose = parent.fiber.effect(() => {
				const remove = runtime.fibers.push(this);
				return async () => {
					this.uid = null;
					emitPluginDisposed(this.context, this);
					if (this.ctx.registry.has(runtime.callback)) {
						remove();
						if (!runtime.fibers.length) this.ctx.registry.delete(runtime.callback);
					}
					this._setEpoch(INACTIVE);
					if (!this.inertia) this._updateState(() => {
						this.inertia = this._unload();
						return 5;
					});
					while (this.inertia) await this.inertia;
				};
			}, "ctx.plugin()");
			try {
				this.context.emit("internal/plugin", this);
			} catch (error) {
				Promise.resolve(this.dispose()).catch((reason) => this.ctx.logger.error(reason));
				throw error;
			}
			if (this.uid !== null && parent.fiber.state !== 5) {
				for (const name of Object.keys(this.inject)) this._checkImpl(name);
				this._refresh();
			}
		} else {
			this.uid = 0;
			this.ctx = this.context = parent;
			this.state = 2;
			this.store = Object.create(null);
			this._runner = {
				epoch: "",
				getOuterStack,
				execute: () => {},
				collect
			};
			this.dispose = () => this.restart();
		}
	}
	/** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
	get name() {
		let fiber = this;
		do {
			if (fiber.runtime?.name) return fiber.runtime.name;
			fiber = fiber.parent.fiber;
		} while (fiber !== fiber.parent.fiber);
		return "root";
	}
	/**
	* Throw if the fiber has already been disposed.
	*
	* @returns nothing when the fiber is still active.
	* @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
	*/
	assertActive() {
		if (this.uid !== null) return;
		throw new CordisError("INACTIVE_EFFECT");
	}
	_execute(runner) {
		const oldEpoch = runner.epoch;
		return composeError((info) => {
			const safeCollect = (dispose) => {
				if (typeof dispose === "function") runner.collect(dispose);
				else if (!isNullable(dispose)) throw new TypeError("Invalid effect");
			};
			const effect = runner.execute.call(this);
			if (typeof effect === "function") return runner.collect(effect);
			else if (isNullable(effect)) {} else if (!isObject(effect)) throw new TypeError("Invalid effect");
			else if ("then" in effect) return effect.then(safeCollect);
			else if (Symbol.iterator in effect) {
				info.error = /* @__PURE__ */ new Error();
				const iter = effect[Symbol.iterator]();
				while (true) {
					const result = iter.next();
					safeCollect(result.value);
					if (result.done) return;
				}
			} else if (Symbol.asyncIterator in effect) {
				const iter = effect[Symbol.asyncIterator]();
				return (async () => {
					await Promise.resolve();
					info.error = /* @__PURE__ */ new Error();
					while (true) {
						if (runner.epoch !== oldEpoch) return;
						const result = await iter.next();
						safeCollect(result.value);
						if (result.done) return;
					}
				})();
			} else throw new TypeError("Invalid effect");
		}, runner.getOuterStack);
	}
	effect(execute, label = "anonymous") {
		this.assertActive();
		if (this.state === 5) throw new CordisError("INACTIVE_EFFECT");
		const disposables = [];
		let disposing = false;
		let disposalTask;
		const dispose = () => {
			if (disposing) return disposalTask;
			disposing = true;
			let task;
			for (const disposable of disposables.splice(0).reverse()) if (task) task = task.then(() => runDisposable(disposable));
			else {
				const result = runDisposable(disposable);
				if (isObject(result) && "then" in result) task = result;
			}
			return disposalTask = task;
		};
		const meta = {
			label,
			children: []
		};
		const runner = {
			execute,
			epoch: true,
			collect: (dispose) => {
				disposables.push(dispose);
				this._disposables.delete(dispose);
				if (dispose[symbols.effect]) meta.children.push(dispose[symbols.effect]);
			},
			getOuterStack: buildOuterStack()
		};
		let task;
		let executing = true;
		let resolveSetup;
		let rejectSetup;
		let setupBarrier;
		let setupFailed = false;
		let inFlight;
		let removeWrapper = () => false;
		const waitForSetup = () => {
			setupBarrier ??= new Promise((resolve, reject) => {
				resolveSetup = resolve;
				rejectSetup = reject;
			});
			return setupBarrier;
		};
		const disposeAfter = (setup) => {
			return Promise.resolve(setup).then(() => dispose(), async (reason) => {
				await dispose();
				throw reason;
			});
		};
		const finalizeDisposal = (callback) => {
			let result;
			try {
				result = callback();
			} catch (error) {
				removeWrapper();
				throw error;
			}
			if (isObject(result) && "then" in result) {
				const pending = Promise.resolve(result).finally(() => {
					removeWrapper();
					if (inFlight === pending) inFlight = void 0;
				});
				return inFlight = pending;
			}
			removeWrapper();
			return result;
		};
		const wrapper = defineProperty(() => {
			if (!runner.epoch) return setupFailed ? inFlight : void 0;
			runner.epoch = false;
			return finalizeDisposal(() => {
				if (executing) return disposeAfter(waitForSetup());
				return task ? disposeAfter(task) : dispose();
			});
		}, symbols.effect, meta);
		effectInertia.set(wrapper, () => inFlight);
		removeWrapper = this._disposables.push(wrapper);
		try {
			task = this._execute(runner);
		} catch (reason) {
			executing = false;
			setupFailed = true;
			runner.epoch = false;
			let cleanup;
			try {
				cleanup = finalizeDisposal(dispose);
			} finally {
				rejectSetup?.(reason);
			}
			if (isObject(cleanup) && "then" in cleanup) cleanup.catch((error) => this.ctx.logger.error(error));
			throw reason;
		}
		executing = false;
		if (setupBarrier) Promise.resolve(task).then(resolveSetup, rejectSetup);
		task?.catch(() => {
			if (!runner.epoch) return dispose();
			return finalizeDisposal(dispose);
		}).catch((error) => this.ctx.logger.error(error));
		const disposeAsync = () => {
			if (!runner.epoch) return;
			runner.epoch = false;
			return finalizeDisposal(dispose);
		};
		wrapper.then = async (onFulfilled, onRejected) => {
			return Promise.resolve(task).then(() => disposeAsync).then(onFulfilled, onRejected);
		};
		return wrapper;
	}
	/**
	* Return metadata for currently registered effects.
	*
	* @returns one {@link EffectMeta} tree per labeled live effect.
	*/
	getEffects() {
		return [...this._disposables].map((dispose) => dispose[symbols.effect]).filter(Boolean);
	}
	_getState() {
		if (this.uid === null) return 4;
		if (this._error) return 3;
		if (this._runner.epoch !== INACTIVE) return 2;
		return 0;
	}
	_updateState(callback) {
		const oldState = this.state;
		this.state = callback() ?? this._getState();
		if (oldState === this.state) return;
		this.context.emit("internal/status", this, oldState);
		if (oldState !== 2 && this.state !== 2) return;
		for (const key of Reflect.ownKeys(this.ctx.reflect.store)) {
			const impl = this.ctx.reflect.store[key];
			if (impl.fiber !== this) continue;
			this.ctx.reflect.notify([impl.name]);
		}
	}
	_checkImpl(name) {
		const impl = this.ctx.reflect._getImpl(name, true);
		if (!impl) return delete this._store[name];
		try {
			if (impl.check && !impl.check.call(getTraceable(this.ctx, impl.value))) return delete this._store[name];
		} catch (error) {
			impl.fiber.ctx.logger.error(error);
			return delete this._store[name];
		}
		this._store[name] = impl;
	}
	_refresh() {
		let epoch = false;
		epoch = "";
		for (const name of Object.keys(this.inject)) {
			const impl = this._store[name];
			if (!impl) {
				epoch = INACTIVE;
				break;
			}
			epoch += ":" + impl.fiber.uid;
		}
		this._setEpoch(epoch);
	}
	_setEpoch(epoch) {
		const oldEpoch = this._runner.epoch;
		if (epoch === oldEpoch) return;
		this._runner.epoch = epoch;
		if (this.inertia) return;
		this._updateState(() => {
			if (epoch !== INACTIVE && oldEpoch === INACTIVE) {
				this.inertia = this._reload();
				return 1;
			} else {
				this.inertia = this._unload();
				return 5;
			}
		});
	}
	_resolveConfig(config) {
		config = this.context.waterfall(this, "internal/config", config, () => config);
		return this.runtime ? resolveConfig(this.runtime, config) : config;
	}
	async _reload() {
		this.store = { ...this._store };
		const oldEpoch = this._runner.epoch;
		try {
			await Promise.resolve();
			if (this._runner.epoch === oldEpoch) {
				this.config = this._resolveConfig(this._config);
				await this._execute(this._runner);
				this._error = void 0;
			}
		} catch (reason) {
			this.ctx.logger.error(reason);
			this._error = reason;
			this._runner.epoch = INACTIVE;
		}
		this._updateState(() => {
			if (this._runner.epoch === oldEpoch) this.inertia = void 0;
			else {
				this.inertia = this._unload();
				return 5;
			}
		});
	}
	async _unload() {
		await Promise.all(this._disposables.clear().map(async (dispose) => {
			try {
				await composeError(async (info) => {
					await Promise.resolve();
					info.error = /* @__PURE__ */ new Error();
					await runDisposable(dispose);
				}, this._runner.getOuterStack);
			} catch (reason) {
				this.ctx.logger.error(reason);
			}
		}));
		this.store = void 0;
		this._updateState(() => {
			if (this._runner.epoch === INACTIVE) this.inertia = void 0;
			else {
				this.inertia = this._reload();
				return 1;
			}
		});
	}
	/**
	* Wait for current lifecycle work and rethrow startup errors.
	*
	* @returns this fiber, once it has settled into a stable state.
	* @throws the config-validation or plugin-startup error, if any.
	*/
	async await() {
		while (this.inertia) await this.inertia;
		if (this._error) throw this._error;
		return this;
	}
	/**
	* Dispose and immediately reload this plugin with its current config.
	*
	* @returns a promise resolving once the reload settled.
	* @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
	*/
	async restart() {
		this.assertActive();
		this._setEpoch(INACTIVE);
		this._refresh();
		await this.await();
	}
	/**
	* Validate and apply new config, then restart the plugin.
	*
	* Runs the `internal/update` waterfall first, so update hooks (and HMR)
	* can veto or replace the restart.
	*
	* @param config — the new raw config; validated before anything restarts.
	* @param noSave — hint for persistence hooks not to write the change back.
	* @returns nothing; the restart runs behind the `internal/update` waterfall.
	* @throws {ValidationError} when the new config fails validation.
	*/
	update(config, noSave = false) {
		this.assertActive();
		this._config = config;
		if (this.state !== 2) {
			this._error = void 0;
			this._setEpoch(INACTIVE);
			this._refresh();
			return;
		}
		config = this._resolveConfig(config);
		this.context.waterfall(this, "internal/update", config, noSave, () => {
			this.config = config;
			this._error = void 0;
			return this.restart();
		});
	}
};
function isApplicable(object) {
	return object && typeof object === "object" && typeof object.apply === "function";
}
/**
* Decorator for declaring service dependencies on classes or class methods.
*
* On classes it contributes to the plugin's static `inject` map. On methods it
* delays the method call until the declared services are available.
*/
/**
* @param name — the required service name.
* @param config — optional intercept config applied for that service.
* @returns the class or method decorator.
*/
function Inject(name, config) {
	return function(value, decorator) {
		if (decorator.kind === "class") {
			if (!Object.hasOwn(value, "inject")) {
				defineProperty(value, "inject", Object.create(Object.getPrototypeOf(value).inject ?? null));
				defineProperty(value.inject, symbols.checkProto, true);
			}
			value.inject[name] = config;
		} else if (decorator.kind === "method") {
			const inject = (value[symbols.metadata] ??= {}).inject ??= Object.create(null);
			inject[name] = config;
			decorator.addInitializer(function() {
				const property = this[symbols.tracker]?.property;
				(this[symbols.initHooks] ??= []).push(() => {
					this.ctx.inject(inject, (ctx) => {
						return value.call(property ? withProps(this, { [property]: ctx }) : this);
					});
				});
			});
		} else throw new Error("@Inject() can only be used on class or class methods");
	};
}
/** Utilities for normalizing plugin dependency declarations. */
(function(Inject) {
	/**
	* Convert array/object/class-inherited inject metadata into a plain map.
	*
	* @param inject — the declaration to normalize; `null`/`undefined` add nothing.
	* @param result — the map to fill (service name → intercept config or `null`).
	* @returns `result`.
	*/
	function resolve(inject, result = Object.create(null)) {
		if (!inject) return result;
		if (Array.isArray(inject)) for (const name of inject) result[name] = null;
		else if (Reflect.has(inject, symbols.checkProto)) {
			Object.assign(result, resolve(Object.getPrototypeOf(inject)));
			for (const name of Object.keys(inject)) result[name] = inject[name] ?? null;
		} else for (const name of Object.keys(inject)) result[name] = inject[name] ?? null;
		return result;
	}
	Inject.resolve = resolve;
})(Inject || (Inject = {}));
/**
* Plugin registry installed as `ctx.registry` and mixed into every context.
*
* It normalizes plugin shapes, tracks plugin runtimes, starts fibers, and
* exposes map-like inspection over active plugin callbacks.
*/
var RegistryService = class {
	ctx;
	_counter = 0;
	_internal = /* @__PURE__ */ new Map();
	constructor(ctx) {
		this.ctx = ctx;
		defineProperty(this, symbols.tracker, {
			property: "ctx",
			noShadow: true
		});
	}
	/** Allocate the next fiber uid (increments on every read). */
	get counter() {
		return ++this._counter;
	}
	/** Number of registered plugin runtimes. */
	get size() {
		return this._internal.size;
	}
	/**
	* Resolve a supported plugin shape to its executable callback.
	*
	* @param plugin — a function, class, or `{ apply }` object plugin.
	* @returns the callback identifying the plugin, or `undefined` if invalid.
	*/
	resolve(plugin) {
		try {
			if (typeof plugin === "function") return plugin;
			if (isApplicable(plugin)) return plugin.apply;
		} catch {}
	}
	/**
	* Look up the runtime record for a plugin.
	*
	* @param plugin — any supported plugin shape.
	* @returns the runtime, or `undefined` when the plugin is not registered.
	*/
	get(plugin) {
		const key = this.resolve(plugin);
		return key && this._internal.get(key);
	}
	/**
	* Check whether a plugin has a registered runtime.
	*
	* @param plugin — any supported plugin shape.
	* @returns `true` when at least one fiber of the plugin exists.
	*/
	has(plugin) {
		const key = this.resolve(plugin);
		return !!key && this._internal.has(key);
	}
	/**
	* Dispose every running fiber for a plugin and remove its runtime record.
	*
	* @param plugin — any supported plugin shape.
	* @returns the removed runtime, or `undefined` when none was registered.
	*/
	delete(plugin) {
		const key = this.resolve(plugin);
		const runtime = key && this._internal.get(key);
		if (!runtime) return;
		this._internal.delete(key);
		for (const fiber of runtime.fibers) fiber.dispose();
		return runtime;
	}
	/** Iterate the registered plugin callbacks. */
	keys() {
		return this._internal.keys();
	}
	/** Iterate the registered plugin runtimes. */
	values() {
		return this._internal.values();
	}
	/** Iterate `[callback, runtime]` pairs. */
	entries() {
		return this._internal.entries();
	}
	/**
	* Visit every registered runtime.
	*
	* @param callback — receives each runtime and its identifying callback.
	*/
	forEach(callback) {
		return this._internal.forEach(callback);
	}
	/**
	* Start a callback once the requested dependencies are available.
	*
	* @param inject — required services, as an array or a name → config map.
	* @param callback — plugin body called with `(ctx, config)`.
	* @returns the fiber; awaiting it settles once loading finished.
	*/
	inject(inject, callback) {
		return this.plugin({
			inject,
			apply: callback,
			name: callback.name
		});
	}
	/**
	* Start a plugin in the current context and return its fiber.
	*
	* Creates (or reuses) the plugin's runtime record, then starts a new fiber
	* under the current context. Throws if `plugin` is not a supported shape or
	* if the current fiber is already disposed.
	*
	* @param plugin — a function, class, or `{ apply }` object plugin.
	* @param config — the plugin config, validated against its `Config` schema.
	* @param getOuterStack — captures the caller stack for effect diagnostics.
	* @returns the fiber; awaiting it settles once loading finished.
	*/
	plugin(plugin, config, getOuterStack = buildOuterStack()) {
		const callback = this.resolve(plugin);
		if (!callback) throw new Error("invalid plugin, expect function or object with an \"apply\" method, received " + typeof plugin);
		this.ctx.fiber.assertActive();
		let runtime = this._internal.get(callback);
		if (!runtime) {
			let name = plugin.name;
			if (name === "apply") name = void 0;
			runtime = {
				name,
				callback,
				fibers: new DisposableList(),
				Config: plugin.Config
			};
			this._internal.set(callback, runtime);
		}
		const fiber = new Fiber(this.ctx, config, Inject.resolve(plugin.inject), runtime, getOuterStack);
		const wrapped = Object.create(fiber);
		wrapped.then = (onFulfilled, onRejected) => {
			return fiber.await().then(onFulfilled, onRejected);
		};
		return wrapped;
	}
};
/**
* Root and child dependency containers for Cordis plugins.
*
* A context is a proxy: normal property reads go through the service resolver,
* while `extend()`, `isolate()`, and `intercept()` create scoped child
* contexts without mutating their parent.
*/
var Context = class Context {
	/** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
	static effect = symbols.effect;
	/** Symbol key for a context's listener filter, consulted on every event dispatch. */
	static filter = symbols.filter;
	/** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
	static isolate = symbols.isolate;
	/** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
	static intercept = symbols.intercept;
	/**
	* Returns true for Cordis context proxies and context prototypes.
	*
	* Works across realms and across multiple copies of cordis, because the
	* brand is keyed by a global symbol rather than by `instanceof`.
	*
	* @param value — the value to test.
	* @returns `true` if `value` is a Cordis context, narrowing its type.
	*/
	static is(value) {
		return !!value?.[Context.is];
	}
	static {
		Context.is[Symbol.toPrimitive] = () => Symbol.for("cordis.is");
		Context.prototype[Context.is] = true;
	}
	/** Create the root context and install the built-in services. */
	constructor() {
		this[symbols.isolate] = Object.create(null);
		this[symbols.intercept] = Object.create(null);
		const self = new Proxy(this, ReflectService.handler);
		this.root = self;
		this.baseUrl = void 0;
		this.fiber = new Fiber(self, {}, Object.create(null), null, () => []);
		this.reflect = new ReflectService(self);
		this.registry = new RegistryService(self);
		this.events = new EventsService(self);
		this.logger = new LoggerService(self);
		this.fiber._disposables.clear();
		return self;
	}
	[Symbol.for("nodejs.util.inspect.custom")]() {
		return `Context <${this.fiber.name}>`;
	}
	/**
	* Create a child context with extra metadata on top of the current scope.
	*
	* The child prototypally inherits every property of this context; own
	* properties of `meta` shadow the inherited ones. The parent is not mutated.
	*
	* @param meta — own properties (including symbol keys) to define on the child.
	* @returns a child context inheriting from this one.
	*/
	extend(meta = {}) {
		const shadow = Reflect.getOwnPropertyDescriptor(this, symbols.shadow)?.value;
		const self = Object.create(getTraceable(this, this));
		for (const prop of Reflect.ownKeys(meta)) Object.defineProperty(self, prop, Reflect.getOwnPropertyDescriptor(meta, prop));
		if (!shadow) return self;
		return Object.assign(Object.create(self), { [symbols.shadow]: shadow });
	}
	/**
	* Create a child context with an independent service scope for `name`.
	*
	* Below the returned context, reads and writes of the service `name`
	* resolve against the new label instead of the parent's, so a different
	* implementation can be provided without affecting the parent scope.
	* Passing the same `label` to two `isolate()` calls joins their scopes.
	*
	* @param name — the service name to isolate.
	* @param label — scope label to join; defaults to a fresh unique symbol.
	* @returns a child context whose `name` service resolves in the new scope.
	*/
	isolate(name, label) {
		const shadow = Object.create(this[symbols.isolate]);
		shadow[name] = label ?? Symbol(name);
		return this.extend({ [symbols.isolate]: shadow });
	}
	intercept(name, config) {
		const intercept = Object.create(this[symbols.intercept]);
		intercept[name] = config;
		return this.extend({ [symbols.intercept]: intercept });
	}
};
/**
* Base class for services that expose a named API on `ctx`.
*
* Subclasses call `super(ctx, name)` from their constructor. The service is
* registered immediately and is automatically removed with the owning fiber.
*/
var Service = class Service {
	ctx;
	/** Symbol key of an instance method run after construction (class plugins). */
	static init = symbols.init;
	/** Symbol key of the availability predicate passed to `ctx.provide()`. */
	static check = symbols.check;
	/** Symbol key of the phantom intercept-config type parameter. */
	static config = symbols.config;
	/** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
	static invoke = symbols.invoke;
	/** Symbol key of the helper deriving an extended service instance. */
	static extend = symbols.extend;
	/** Symbol key of the tracker metadata used for context tracing. */
	static tracker = symbols.tracker;
	/** Symbol key of the intercept-config resolution helper below. */
	static resolveConfig = symbols.resolveConfig;
	/** The service name this instance is registered under. */
	name;
	/**
	* Register this instance as `name` in the current context.
	*
	* Calls `ctx.reflect.provide(name, this, this[Service.check])`, so the
	* service is unregistered automatically when the owning fiber unloads.
	* Services with a `[Service.invoke]` body return a callable instance.
	*
	* @param ctx — the context to register in (stored as `this.ctx`).
	* @param name — the service name; defaults to the static `provide` field.
	*/
	constructor(ctx, name) {
		this.ctx = ctx;
		name ??= this.constructor["provide"];
		let self = this;
		const tracker = {
			associate: name,
			property: "ctx"
		};
		if (self[symbols.invoke]) self = createCallable(name, joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
		self.ctx = ctx;
		self.name = name;
		defineProperty(self, symbols.tracker, tracker);
		self.ctx.reflect.provide(name, self, this[symbols.check]);
		return self;
	}
	[symbols.filter](ctx) {
		return ctx[symbols.isolate][this.name] === this.ctx[symbols.isolate][this.name];
	}
	[symbols.extend](props) {
		let self;
		if (this[Service.invoke]) self = createCallable(this.name, this, this[symbols.tracker]);
		else self = Object.create(this);
		return Object.assign(self, props);
	}
	/**
	* Merge intercept config from ancestors with optional base and head values.
	*
	* Entries added closer to the root apply first; `base` is prepended and
	* `head` appended. Uses `Config.merge` when the service declares one,
	* otherwise a shallow `Object.assign`.
	*
	* @param base — lowest-precedence config merged before all intercepts.
	* @param head — highest-precedence config merged after all intercepts.
	* @returns the merged config.
	*/
	[symbols.resolveConfig](base, head) {
		let intercept = this.ctx[Context.intercept];
		const configs = [];
		while (this.name in intercept) {
			if (Object.hasOwn(intercept, this.name)) configs.unshift(intercept[this.name]);
			intercept = Object.getPrototypeOf(intercept);
		}
		if (base) configs.unshift(base);
		if (head) configs.push(head);
		if (this["Config"]?.merge) return this["Config"].merge(...configs);
		else return Object.assign({}, ...configs);
	}
	static [Symbol.hasInstance](instance) {
		if (!instance) return false;
		let constructor = instance.constructor;
		while (constructor) {
			constructor = constructor.prototype?.constructor;
			if (constructor === this) return true;
			constructor &&= Object.getPrototypeOf(constructor);
		}
		return false;
	}
};
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+schemastery@3.18.4/node_modules/@deepseek-ai/schemastery/lib/index.mjs
const kSchema = Symbol.for("schemastery");
const kValidationError = Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError = class extends TypeError {
	options;
	name = "ValidationError";
	constructor(message, options) {
		let prefix = "$";
		for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
		else if (typeof segment === "number") prefix += "[" + segment + "]";
		else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
		if (prefix.startsWith(".")) prefix = prefix.slice(1);
		super((prefix === "$" ? "" : `${prefix} `) + message);
		this.options = options;
	}
	static is(error) {
		return !!error?.[kValidationError];
	}
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
const Schema = function(options) {
	const schema = function(data, options = {}) {
		return Schema.resolve(data, schema, options)[0];
	};
	if (options.refs) {
		const refs = mapValues(options.refs, (options) => new Schema(options));
		const getRef = (uid) => refs[uid];
		for (const key in refs) {
			const options = refs[key];
			options.sKey = getRef(options.sKey);
			options.inner = getRef(options.inner);
			options.list = options.list && options.list.map(getRef);
			options.dict = options.dict && mapValues(options.dict, getRef);
		}
		return refs[options.uid];
	}
	Object.assign(schema, options);
	if (typeof schema.callback === "string") try {
		schema.callback = new Function("return " + schema.callback)();
	} catch {}
	Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
	Object.setPrototypeOf(schema, Schema.prototype);
	schema.meta ||= {};
	schema.toString = schema.toString.bind(schema);
	return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
	return {
		version: 1,
		vendor: "schemastery",
		validate: (value) => {
			try {
				return { value: Schema.resolve(value, this, {})[0] };
			} catch (error) {
				if (ValidationError.is(error)) return { issues: [{
					message: error.message,
					path: error.options.path
				}] };
				throw error;
			}
		}
	};
} });
Schema.ValidationError = ValidationError;
Schema.prototype.toJSON = function toJSON() {
	if (globalThis.__schemastery_refs__) {
		globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
		return this.uid;
	}
	globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
	globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
	const result = {
		uid: this.uid,
		refs: globalThis.__schemastery_refs__
	};
	globalThis.__schemastery_refs__ = void 0;
	return result;
};
Schema.prototype.set = function set(key, value) {
	this.dict[key] = value;
	return this;
};
Schema.prototype.push = function push(value) {
	this.list.push(value);
	return this;
};
function mergeDesc(original, messages) {
	const result = typeof original === "string" ? { "": original } : { ...original };
	for (const locale in messages) {
		const value = messages[locale];
		if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
		else if (typeof value === "string") result[locale] = value;
	}
	return result;
}
function getInner(value) {
	return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
	return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
	const schema = Schema(this);
	const desc = mergeDesc(schema.meta.description, messages);
	if (Object.keys(desc).length) schema.meta.description = desc;
	if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
		return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
	});
	if (schema.list) schema.list = schema.list.map((inner, index) => {
		return inner.i18n(mapValues(messages, (data = {}) => {
			if (Array.isArray(getInner(data))) return getInner(data)[index];
			if (Array.isArray(data)) return data[index];
			return extractKeys(data);
		}));
	});
	if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
		if (getInner(data)) return getInner(data);
		return extractKeys(data);
	}));
	if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
	return schema;
};
Schema.prototype.extra = function extra(key, value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
};
for (const key of [
	"required",
	"disabled",
	"collapse",
	"hidden",
	"loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.deprecated = function deprecated() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "deprecated",
		type: "danger"
	});
	return schema;
};
Schema.prototype.experimental = function experimental() {
	const schema = Schema(this);
	schema.meta.badges ||= [];
	schema.meta.badges.push({
		text: "experimental",
		type: "warning"
	});
	return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
	const schema = Schema(this);
	const pattern = pick(regexp, ["source", "flags"]);
	schema.meta = {
		...schema.meta,
		pattern
	};
	return schema;
};
Schema.prototype.simplify = function simplify(value) {
	if (isVolatile(value)) value = value.get();
	if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
	if (isNullable(value)) return value;
	if (this.type === "object" || this.type === "dict") {
		const result = {};
		for (const key in value) {
			const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
			if (this.type === "dict" || !isNullable(item)) result[key] = item;
		}
		if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
		return result;
	} else if (this.type === "array" || this.type === "tuple") {
		const result = [];
		value.forEach((value, index) => {
			const schema = this.type === "array" ? this.inner : this.list[index];
			const item = schema ? schema.simplify(value) : value;
			result.push(item);
		});
		return result;
	} else if (this.type === "intersect") {
		const result = {};
		for (const item of this.list) Object.assign(result, item.simplify(value));
		return result;
	} else if (this.type === "union") for (const schema of this.list) try {
		Schema.resolve(value, schema, {});
		return schema.simplify(value);
	} catch {}
	return value;
};
Schema.prototype.toString = function toString(inline) {
	return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		role,
		extra
	};
	return schema;
};
for (const key of [
	"default",
	"link",
	"comment",
	"description",
	"max",
	"min",
	"step"
]) Object.assign(Schema.prototype, { [key](value) {
	const schema = Schema(this);
	schema.meta = {
		...schema.meta,
		[key]: value
	};
	return schema;
} });
Schema.prototype.volatile = function volatile() {
	if (this.meta.volatile) throw new TypeError("volatile schema is already wrapped");
	return this.extra("volatile", true);
};
const resolvers = {};
const checkedVolatile = Symbol("checked-volatile-schema");
function validateVolatileSchema(schema, path = [], blocked = false, seen = /* @__PURE__ */ new Map()) {
	const states = seen.get(schema) ?? /* @__PURE__ */ new Set();
	if (states.has(blocked)) return;
	states.add(blocked);
	seen.set(schema, states);
	if (schema.meta?.volatile && blocked) throw new ValidationError("volatile fields require a fixed object path without an enclosing volatile field", { path });
	const nested = blocked || !!schema.meta?.volatile;
	if (schema.dict) for (const [key, child] of Object.entries(schema.dict)) validateVolatileSchema(child, [...path, key], nested, seen);
	if (schema.sKey) validateVolatileSchema(schema.sKey, [...path, "<key>"], true, seen);
	if (schema.inner && (schema.type !== "lazy" || schema.inner[kSchema])) validateVolatileSchema(schema.inner, [...path, "*"], true, seen);
	if (schema.list) for (let index = 0; index < schema.list.length; index++) validateVolatileSchema(schema.list[index], [...path, String(index)], true, seen);
}
Schema.extend = function extend(type, resolve) {
	resolvers[type] = resolve;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
	if (!schema) return [data];
	if (!options[checkedVolatile]) {
		validateVolatileSchema(schema, options.path);
		options = {
			...options,
			[checkedVolatile]: true
		};
	}
	if (schema.meta?.volatile) {
		const inner = Schema(schema);
		inner.meta = {
			...schema.meta,
			volatile: false
		};
		const [value, adapted] = Schema.resolve(data, inner, options, strict);
		try {
			return [createVolatile(value), adapted];
		} catch (error) {
			throw new ValidationError(error instanceof Error ? error.message : String(error), options);
		}
	}
	if (options.ignore?.(data, schema)) return [data];
	if (isNullable(data) && schema.type !== "lazy") {
		if (schema.meta.required) throw new ValidationError(`missing required value`, options);
		let current = schema;
		let fallback = schema.meta.default;
		while (current?.type === "intersect" && isNullable(fallback)) {
			current = current.list[0];
			fallback = current?.meta.default;
		}
		if (isNullable(fallback)) return [data];
		data = clone(fallback);
	}
	const callback = resolvers[schema.type];
	if (!callback) throw new ValidationError(`unsupported type "${schema.type}"`, options);
	try {
		return callback(data, schema, options, strict);
	} catch (error) {
		if (!schema.meta.loose) throw error;
		return [schema.meta.default];
	}
};
Schema.from = function from(source) {
	if (isNullable(source)) return Schema.any();
	else if ([
		"string",
		"number",
		"boolean"
	].includes(typeof source)) return Schema.const(source).required();
	else if (source[kSchema]) return source;
	else if (typeof source === "function") switch (source) {
		case String: return Schema.string().required();
		case Number: return Schema.number().required();
		case Boolean: return Schema.boolean().required();
		case Function: return Schema.function().required();
		default: return Schema.is(source).required();
	}
	else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
	const toJSON = () => {
		if (!schema.inner[kSchema]) {
			schema.inner = schema.builder();
			schema.inner.meta = {
				...schema.meta,
				...schema.inner.meta
			};
		}
		return schema.inner.toJSON();
	};
	const schema = new Schema({
		type: "lazy",
		builder,
		inner: { toJSON }
	});
	return schema;
};
Schema.natural = function natural() {
	return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
	return Schema.number().step(.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
	return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
		const date = new Date(value);
		if (isNaN(+date)) throw new ValidationError(`invalid date "${value}"`, options);
		return date;
	}, true)]);
};
Schema.regExp = function regExp(flag = "") {
	return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
		try {
			return new RegExp(value, flag);
		} catch (e) {
			throw new ValidationError(e.message, options);
		}
	}, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
	return Schema.union([
		Schema.is(ArrayBuffer),
		Schema.is(SharedArrayBuffer),
		Schema.transform(Schema.any(), (value, options) => {
			if (Binary.isSource(value)) return Binary.fromSource(value);
			throw new ValidationError(`expected ArrayBufferSource but got ${value}`, options);
		}, true),
		...encoding ? [Schema.transform(Schema.string(), (value, options) => {
			try {
				return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
			} catch (e) {
				throw new ValidationError(e.message, options);
			}
		}, true)] : []
	]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
	if (!schema.inner[kSchema]) {
		schema.inner = schema.builder();
		schema.inner.meta = {
			...schema.meta,
			...schema.inner.meta
		};
		validateVolatileSchema(schema.inner, options.path, true);
	}
	return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
	return [data];
});
Schema.extend("never", (data, _, options) => {
	throw new ValidationError(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
	if (deepEqual(data, value)) return [value];
	throw new ValidationError(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
	const { max = Infinity, min = -Infinity } = meta;
	if (data > max) throw new ValidationError(`expected ${description} <= ${max} but got ${data}`, options);
	if (data < min && !skipMin) throw new ValidationError(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
	if (typeof data !== "string") throw new ValidationError(`expected string but got ${data}`, options);
	if (meta.pattern) {
		const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
		if (!regexp.test(data)) throw new ValidationError(`expect string to match regexp ${regexp}`, options);
	}
	checkWithinRange(data.length, meta, "string length", options);
	return [data];
});
function decimalShift(data, digits) {
	const str = data.toString();
	if (str.includes("e")) return data * Math.pow(10, digits);
	const index = str.indexOf(".");
	if (index === -1) return data * Math.pow(10, digits);
	const frac = str.slice(index + 1);
	const integer = str.slice(0, index);
	if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
	return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
	step = Math.abs(step);
	if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
	const index = step.toString().indexOf(".");
	const digits = step.toString().slice(index + 1).length;
	return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
	if (typeof data !== "number") throw new ValidationError(`expected number but got ${data}`, options);
	checkWithinRange(data, meta, "number", options);
	const { step } = meta;
	if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError(`expected number multiple of ${step} but got ${data}`, options);
	return [data];
});
Schema.extend("boolean", (data, _, options) => {
	if (typeof data === "boolean") return [data];
	throw new ValidationError(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
	let value = 0, keys = [];
	if (typeof data === "number") {
		value = data;
		for (const key in bits) if (data & bits[key]) keys.push(key);
	} else if (Array.isArray(data)) {
		keys = data;
		for (const key of keys) {
			if (typeof key !== "string") throw new ValidationError(`expected string but got ${key}`, options);
			if (key in bits) value |= bits[key];
		}
	} else throw new ValidationError(`expected number or array but got ${data}`, options);
	if (value === meta.default) return [value];
	return [value, keys];
});
Schema.extend("function", (data, _, options) => {
	if (typeof data === "function") return [data];
	throw new ValidationError(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
	if (typeof constructor === "function") {
		if (data instanceof constructor) return [data];
		throw new ValidationError(`expected ${constructor.name} but got ${data}`, options);
	} else {
		if (isNullable(data)) throw new ValidationError(`expected ${constructor} but got ${data}`, options);
		let prototype = Object.getPrototypeOf(data);
		while (prototype) {
			if (prototype.constructor?.name === constructor) return [data];
			prototype = Object.getPrototypeOf(prototype);
		}
		throw new ValidationError(`expected ${constructor} but got ${data}`, options);
	}
});
function property(data, key, schema, options) {
	try {
		const [value, adapted] = Schema.resolve(data[key], schema, {
			...options,
			path: [...options.path || [], key]
		});
		if (adapted !== void 0) data[key] = adapted;
		return value;
	} catch (e) {
		if (!options?.autofix) throw e;
		delete data[key];
		return schema.meta.volatile ? createVolatile(schema.meta.default) : schema.meta.default;
	}
}
Schema.extend("array", (data, { inner, meta }, options) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
	return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in data) {
		let rKey;
		try {
			rKey = Schema.resolve(key, sKey, options)[0];
		} catch (error) {
			if (strict) continue;
			throw error;
		}
		result[rKey] = property(data, key, inner, options);
		data[rKey] = data[key];
		if (key !== rKey) delete data[key];
	}
	return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
	if (!Array.isArray(data)) throw new ValidationError(`expected array but got ${data}`, options);
	const result = list.map((inner, index) => property(data, index, inner, options));
	if (strict) return [result];
	result.push(...data.slice(list.length));
	return [result];
});
function merge(result, data) {
	for (const key in data) {
		if (key in result) continue;
		result[key] = data[key];
	}
}
Schema.extend("object", (data, { dict }, options, strict) => {
	if (!isPlainObject(data)) throw new ValidationError(`expected object but got ${data}`, options);
	const result = {};
	for (const key in dict) {
		const value = property(data, key, dict[key], options);
		if (!isNullable(value) || key in data) result[key] = value;
	}
	if (!strict) merge(result, data);
	return [result];
});
Schema.extend("union", (data, { list, toString }, options, strict) => {
	const messages = [];
	for (const inner of list) try {
		return Schema.resolve(data, inner, options, strict);
	} catch (error) {
		messages.push(error);
	}
	throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString }, options, strict) => {
	if (!list.length) return [data];
	let result;
	for (const inner of list) {
		const value = Schema.resolve(data, inner, options, true)[0];
		if (isNullable(value)) continue;
		if (isNullable(result)) result = value;
		else if (typeof result !== typeof value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
		else if (typeof value === "object") merge(result ??= {}, value);
		else if (result !== value) throw new ValidationError(`expected ${toString()} but got ${JSON.stringify(data)}`, options);
	}
	if (!strict && isPlainObject(data)) merge(result, data);
	return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
	const [result, adapted = data] = Schema.resolve(data, inner, options, true);
	if (preserve) return [callback(result)];
	else return [callback(result), callback(adapted)];
});
const formatters = {};
function defineMethod(name, keys, format) {
	formatters[name] = format;
	Object.assign(Schema, { [name](...args) {
		const schema = new Schema({ type: name });
		keys.forEach((key, index) => {
			switch (key) {
				case "sKey":
					schema.sKey = args[index] ?? Schema.string();
					break;
				case "inner":
					schema.inner = Schema.from(args[index]);
					break;
				case "list":
					schema.list = args[index].map(Schema.from);
					break;
				case "dict":
					schema.dict = mapValues(args[index], Schema.from);
					break;
				case "bits":
					schema.bits = {};
					for (const key in args[index]) {
						if (typeof args[index][key] !== "number") continue;
						schema.bits[key] = args[index][key];
					}
					break;
				case "callback": {
					const callback = schema.callback = args[index];
					callback["toJSON"] ||= () => callback.toString();
					break;
				}
				case "constructor": {
					const constructor = schema.constructor = args[index];
					if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
					break;
				}
				default: schema[key] = args[index];
			}
		});
		if (name === "object" || name === "dict") schema.meta.default = {};
		else if (name === "array" || name === "tuple") schema.meta.default = [];
		else if (name === "bitset") schema.meta.default = 0;
		return schema;
	} });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
	if (typeof constructor === "function") return constructor.name;
	else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
	if (Object.keys(dict).length === 0) return "{}";
	return `{ ${Object.entries(dict).map(([key, inner]) => {
		return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
	}).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
	const result = list.map(({ toString: format }) => format()).join(" | ");
	return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
	return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
	"inner",
	"callback",
	"preserve"
], ({ inner }, isInner) => inner.toString(isInner));
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-typert-protocol@0.1.7-rc.1_@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/dsh-typert-protocol/lib/index.js
/** The one Remote failure class shared by owners, the Gateway, and consumers. */
/**
* One Remote call failure: a real Error carrying its stable code and typed
* details. Owners throw it at the failure point; the Host Gateway encodes it
* onto the wire unchanged; the Client face rebuilds an instance for the
* `RemoteResult` error branch, so `throw result.error` keeps throw semantics.
* Discrimination is always by `code`, never by instanceof.
*/
var RemoteError = class extends Error {
	code;
	details;
	/** Structural marker: cross-realm/bundle identification never uses instanceof. */
	isDSHRemoteError = true;
	/**
	* @param code - stable failure code declared in {@link RemoteErrorDetailsMap}.
	* @param message - human diagnostic carried across the wire.
	* @param details - structured payload typed by the code.
	* @param options - standard Error options (`cause` survives in-process only).
	*/
	constructor(code, message, details, options) {
		super(message, options);
		this.code = code;
		this.details = details;
		this.name = "RemoteError";
	}
};
/**
* Remote decorators and explicit Gateway bindings backed by versioned
* descriptors carried on decorated class prototypes. Strict reflection
* remains a Typert compiler responsibility.
* @module @deepseek-ai/dsh-typert-protocol
*/
const TYPERT_REMOTE_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/;
/**
* Test one generated Remote name against the Connection endpoint grammar.
* @param value - namespace, method, lookup, or Context segment.
* @returns whether the value can cross the shared RPC carrier unchanged.
*/
function isTypertRemoteSegment(value) {
	return value !== "." && value !== ".." && TYPERT_REMOTE_SEGMENT_PATTERN.test(value);
}
const REMOTE_METHOD_DESCRIPTOR = "@deepseek-ai/dsh-typert-protocol/remote-methods";
/**
* Bind one visible Service field to a Cordis key and Remote namespace. A
* service that owns a Cordis Context also gives its tree `ctx.invocation`,
* `undefined` outside a Remote call, so no `TypertRemoteService` is needed for
* a Host composition to read it.
* @param service - owning Service instance, normally `this`.
* @param serviceKey - exact Cordis service key.
* @param options - optional distinct wire namespace.
* @returns a frozen, inspectable binding with no compiler-injected metadata.
*/
function bindTypertRemote(service, serviceKey, options = {}) {
	validateName("service key", serviceKey);
	const namespace = options.namespace ?? serviceKey;
	validateName("namespace", namespace);
	const ctx = Reflect.get(service, "ctx");
	if (ctx instanceof Context) provideInvocationAccessor(ctx);
	return Object.freeze({
		service,
		serviceKey,
		namespace
	});
}
/** Cordis Service base that exposes its registered name through Typert Gateway. */
var TypertRemoteService = class extends Service {
	/** Visible binding consumed by the Gateway's source-mode discovery. */
	typertRemote;
	/**
	* Register the Service and bind the same key to Typert Gateway.
	* @param ctx - owning Cordis Context.
	* @param serviceKey - exact Cordis service key and default wire namespace.
	* @param options - optional distinct wire namespace.
	*/
	constructor(ctx, serviceKey, options = {}) {
		super(ctx, serviceKey);
		this.typertRemote = bindTypertRemote(this, this.name, options);
	}
};
/**
* Make `ctx.invocation` read as `undefined` outside a Remote call instead of the
* reflect service's "cannot get property" error; a call-derived Context shadows
* the accessor with its own property. The first Remote Service constructed in a
* tree registers it on the root, where it outlives any one Service.
*/
function provideInvocationAccessor(ctx) {
	if (Object.hasOwn(ctx.root.reflect.props, "invocation")) return;
	ctx.root.accessor("invocation", { get: () => void 0 });
}
function Remote(methodExportOrOptions, context) {
	if (typeof methodExportOrOptions === "string") {
		validateName("Remote export name", methodExportOrOptions);
		return remoteDecorator({ kind: "direct" }, void 0, methodExportOrOptions);
	}
	if (typeof methodExportOrOptions === "object") {
		if (remoteOptionMode(methodExportOrOptions) !== "stream" || Reflect.ownKeys(methodExportOrOptions).length !== 1) throw new TypeError("typert-protocol: Remote options must contain exactly mode: \"stream\"");
		return remoteDecorator({ kind: "direct" }, "stream");
	}
	if (context === void 0) throw new TypeError("typert-protocol: Remote decorator context is missing");
	addMarkerInitializer(context, { kind: "direct" });
}
function remoteOptionMode(options) {
	return Reflect.get(options, "mode");
}
function remoteDecorator(invocation, mode, exportName) {
	return function(_method, context) {
		addMarkerInitializer(context, invocation, mode, exportName);
	};
}
function readRemoteMethodDescriptor(prototype) {
	const property = Object.getOwnPropertyDescriptor(prototype, REMOTE_METHOD_DESCRIPTOR);
	if (property === void 0) return void 0;
	const descriptor = property.value;
	if (descriptor === null || typeof descriptor !== "object") throw new TypeError("typert-protocol: Remote method descriptor must be an object");
	const version = Reflect.get(descriptor, "version");
	if (version !== 1) throw new TypeError(`typert-protocol: unsupported Remote method descriptor version ${String(version)}`);
	const methods = Reflect.get(descriptor, "methods");
	if (!Array.isArray(methods)) throw new TypeError("typert-protocol: Remote method descriptor methods must be an array");
	return descriptor;
}
function addMarkerInitializer(context, invocation, mode, exportName) {
	if (context.private || context.static || typeof context.name !== "string") throw new TypeError("typert-protocol: Remote decorators require a public instance method with a string name");
	const method = context.name;
	context.addInitializer(function() {
		const prototype = Object.getPrototypeOf(this);
		if (prototype === null) throw new TypeError(`typert-protocol: cannot mark Remote method "${method}" on an object without a prototype`);
		mark(prototype, method, invocation, mode, exportName);
	});
}
function mark(prototype, method, invocation, mode, exportName) {
	const descriptor = readRemoteMethodDescriptor(prototype);
	const marker = Object.freeze({
		method,
		...exportName === void 0 || exportName === method ? {} : { exportName },
		...mode === void 0 ? {} : { mode },
		invocation: Object.freeze(invocation)
	});
	const current = descriptor?.methods.find((candidate) => candidate.method === method);
	if (current !== void 0) {
		if (current.exportName === marker.exportName && current.mode === marker.mode && sameInvocation(current.invocation, invocation)) return;
		throw new Error(`typert-protocol: Remote method "${method}" has conflicting invocation markers`);
	}
	Object.defineProperty(prototype, REMOTE_METHOD_DESCRIPTOR, {
		configurable: true,
		value: Object.freeze({
			version: 1,
			methods: Object.freeze([...descriptor?.methods ?? [], marker])
		})
	});
}
function sameInvocation(left, right) {
	if (left.kind === "direct") return right.kind === "direct";
	if (right.kind === "direct") return false;
	return left.context === right.context;
}
function validateName(subject, value) {
	if (!isTypertRemoteSegment(value)) throw new TypeError(`typert-protocol: ${subject} must contain only RPC endpoint segment characters`);
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-util-values@0.1.7-rc.1_@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/dsh-util-values/lib/index.js
/**
* Deep-freeze an object graph in place while leaving live AbortSignal objects mutable.
* @param value - value to freeze.
* @returns the same value after every reachable enumerable child is frozen.
*/
function deepFreeze(value) {
	const seen = /* @__PURE__ */ new WeakSet();
	const pending = [{
		kind: "visit",
		node: value
	}];
	while (pending.length > 0) {
		const task = pending.pop();
		/* v8 ignore next -- the loop condition guarantees one pending task. */
		if (task === void 0) continue;
		if (task.kind === "property") {
			pending.push({
				kind: "visit",
				node: task.source[task.key]
			});
			continue;
		}
		const node = task.node;
		if (node === null || typeof node !== "object") continue;
		if (node instanceof AbortSignal) continue;
		if (seen.has(node)) continue;
		seen.add(node);
		Object.freeze(node);
		const keys = Object.keys(node);
		for (let index = keys.length - 1; index >= 0; index--) {
			const key = keys[index];
			/* v8 ignore next -- the loop is bounded by the captured key count. */
			if (key === void 0) continue;
			pending.push({
				kind: "property",
				source: node,
				key
			});
		}
	}
	return value;
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-timeout@0.1.7-rc.1_@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/dsh-timeout/lib/index.js
/** Largest delay Node schedules without clamping it to one millisecond. */
const MAX_TIMER_DELAY_MS = 2147483647;
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-llm@0.1.7-rc.1_@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/dsh-llm/lib/index.js
/**
* Detach and deep-freeze a message whose identity already exists.
* @param message - complete message, including its stable identity.
* @returns an immutable snapshot that preserves the identity.
*/
function freezeMessage(message) {
	return deepFreeze(structuredClone(message));
}
/**
* Harness error base with a stable machine-routable code and chained cause.
* Package errors extend it so tool results and replay can retain failure class.
* @module @deepseek-ai/dsh-llm/error
*/
/**
* Base class for all harness errors. Carries a `code` (stable, programmatic —
* e.g. `NO_ADAPTER`, `INVALID_ARGS`, `INVARIANT`) distinct from the
* human-readable `message`, and supports `cause` chaining via the standard
* `ErrorOptions`. `name` defaults to the subclass constructor name.
*/
var HarnessError = class extends Error {
	/** Stable machine-routable failure class (e.g. `RATE_LIMIT`); route on this, never by parsing `message`. */
	code;
	constructor(message, code, options) {
		super(message, options);
		this.code = code;
		this.name = new.target.name;
	}
};
/**
* Canonical provider-neutral code for a response that completed normally but
* carried no content blocks at all. Providers occasionally emit a degenerate
* completion (a terminal stop with zero output); adapters classify it as this
* failure instead of yielding an empty assistant message, because an empty
* message silently ends the turn with nothing for the user or the loop to act
* on. The attempt produced nothing durable, so retry policy treats it as safe
* to repeat.
*/
const EMPTY_RESPONSE_CODE = "EMPTY_RESPONSE";
new RegExp(String.raw`(?:^|[^a-z0-9])context[\s_-](?:length|window)[\s_-]` + String.raw`(?:exceed(?:ed|s)?|overflow(?:ed)?|limit[\s_-]exceeded)(?:$|[^a-z0-9])`, "i");
new RegExp(String.raw`\b(?:request|prompt|input|messages?)\s+(?:is\s+|are\s+)?` + String.raw`too\s+(?:large|long)\s+for\s+(?:(?:this|the)\s+)?` + String.raw`(?:model(?:'s)?\s+)?context(?:\s+window)?\b`, "i");
new RegExp(String.raw`\b(?:input|prompt|request|messages?)\b.{0,40}` + String.raw`\b(?:exceed(?:s|ed)?|overflows?|is\s+larger\s+than)\b.{0,40}` + String.raw`\b(?:the\s+)?(?:model(?:'s)?\s+)?context(?:\s+(?:length|window))?\b`, "i");
/**
* Provider-owned request-retry policy configuration and resolution.
*
* Adapters expose one resolved policy per registered provider route; the
* optional dsh-llm-retry plugin executes it on the agent's failed-step extension point.
*
* @module @deepseek-ai/dsh-llm/retry-policy
*/
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 1e4;
const DEFAULT_JITTER_RATIO = .1;
const DEFAULT_RETRYABLE_CODES = Object.freeze([
	EMPTY_RESPONSE_CODE,
	"RATE_LIMIT",
	"SERVER",
	"TIMEOUT",
	"TRANSPORT"
]);
const backoffSchema = Schema.object({
	initialDelayMs: Schema.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_INITIAL_DELAY_MS),
	maxDelayMs: Schema.number().max(MAX_TIMER_DELAY_MS).default(DEFAULT_MAX_DELAY_MS),
	jitterRatio: Schema.number().min(0).max(1).default(DEFAULT_JITTER_RATIO)
});
const normalPolicySchema = Schema.object({
	mode: Schema.const("normal").required(),
	maxRetries: Schema.number().step(1).min(0).max(Number.MAX_SAFE_INTEGER).default(DEFAULT_MAX_RETRIES),
	retryableCodes: Schema.array(Schema.string()).default([...DEFAULT_RETRYABLE_CODES]),
	backoff: backoffSchema
});
const alwaysPolicySchema = Schema.object({
	mode: Schema.const("always").required(),
	backoff: backoffSchema
});
Schema.union([normalPolicySchema, alwaysPolicySchema]);
const NORMAL_POLICY_KEYS = /* @__PURE__ */ new Set([
	"mode",
	"maxRetries",
	"retryableCodes",
	"backoff"
]);
const ALWAYS_POLICY_KEYS = /* @__PURE__ */ new Set([
	"mode",
	"maxRetries",
	"retryableCodes",
	"backoff"
]);
const BACKOFF_KEYS = /* @__PURE__ */ new Set([
	"initialDelayMs",
	"maxDelayMs",
	"jitterRatio"
]);
function validateKeys(value, allowed, path) {
	for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${path}: unknown key "${key}"`);
}
function resolveBackoff(config, path) {
	if (config !== void 0) validateKeys(config, BACKOFF_KEYS, path);
	const initialDelayMs = config?.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
	const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
	const jitterRatio = config?.jitterRatio ?? DEFAULT_JITTER_RATIO;
	if (!Number.isFinite(initialDelayMs) || initialDelayMs <= 0 || initialDelayMs > 2147483647) throw new Error(`${path}.initialDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	if (!Number.isFinite(maxDelayMs) || maxDelayMs <= 0 || maxDelayMs > 2147483647) throw new Error(`${path}.maxDelayMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
	if (initialDelayMs > maxDelayMs) throw new Error(`${path}.initialDelayMs must be less than or equal to maxDelayMs`);
	if (!Number.isFinite(jitterRatio) || jitterRatio < 0 || jitterRatio > 1) throw new Error(`${path}.jitterRatio must be between 0 and 1`);
	return Object.freeze({
		initialDelayMs,
		maxDelayMs,
		jitterRatio
	});
}
/**
* Validate, default, and detach one provider-owned retry policy.
* @param config - optional provider configuration; omission selects normal defaults.
* @param path - diagnostic path naming the provider config that owns the value.
* @returns an immutable policy safe to capture in provider registration state.
*/
function resolveRetryPolicy(config, path) {
	if (config === void 0) return Object.freeze({
		mode: "normal",
		maxRetries: DEFAULT_MAX_RETRIES,
		retryableCodes: DEFAULT_RETRYABLE_CODES,
		...resolveBackoff(void 0, `${path}.backoff`)
	});
	switch (config.mode) {
		case "normal": {
			validateKeys(config, NORMAL_POLICY_KEYS, path);
			const maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
			const retryableCodes = config.retryableCodes ?? [...DEFAULT_RETRYABLE_CODES];
			if (!Number.isSafeInteger(maxRetries) || maxRetries < 0) throw new Error(`${path}.maxRetries must be a non-negative safe integer`);
			if (retryableCodes.length === 0) throw new Error(`${path}.retryableCodes must not be empty`);
			if (retryableCodes.some((code) => typeof code !== "string" || code.length === 0)) throw new Error(`${path}.retryableCodes must contain only non-empty strings`);
			if (new Set(retryableCodes).size !== retryableCodes.length) throw new Error(`${path}.retryableCodes must not contain duplicates`);
			return Object.freeze({
				mode: "normal",
				maxRetries,
				retryableCodes: Object.freeze([...retryableCodes]),
				...resolveBackoff(config.backoff, `${path}.backoff`)
			});
		}
		case "always":
			validateKeys(config, ALWAYS_POLICY_KEYS, path);
			return Object.freeze({
				mode: "always",
				...resolveBackoff(config.backoff, `${path}.backoff`)
			});
		default: throw new Error(`${path}.mode must be "normal" or "always"`);
	}
}
/**
* Field-wise equality over {@link LlmCallConfig} — the comparison a caller
* runs to decide whether a proposed configuration is a real change (worth a
* logged header snapshot) or the held one restated.
* @param a - one configuration.
* @param b - the other.
* @returns whether every field (including the `stop` list, element-wise) matches.
*/
function callConfigEquals(a, b) {
	if (a.provider !== b.provider || a.model !== b.model || a.reasoningEffort !== b.reasoningEffort || a.temperature !== b.temperature || a.maxTokens !== b.maxTokens) return false;
	if (a.stop === void 0 || b.stop === void 0) return a.stop === b.stop;
	return a.stop.length === b.stop.length && a.stop.every((s, i) => s === b.stop?.[i]);
}
/**
* Normalization for values thrown by a final LLM adapter boundary.
*
* @module @deepseek-ai/dsh-llm/adapter-failure
*/
/**
* Detach serializable provider facts from a value thrown by an adapter.
* @param value - arbitrary value thrown during adapter dispatch or iteration.
* @returns immutable provider-neutral facts suitable for a terminal finish chunk.
* @internal
*/
function normalizeLlmFailure(value) {
	const error = value instanceof Error ? value : new HarnessError(thrownMessage(value), "UNKNOWN", { cause: value });
	const carried = ownFailureSnapshot(error);
	if (carried !== void 0 && carried.code === ownErrorCode(error)) return carried;
	return Object.freeze({
		message: errorMessage(error),
		code: harnessErrorCode(error)
	});
}
/** Render a non-Error throw without letting hostile coercion escape normalization. */
function thrownMessage(value) {
	try {
		const message = String(value);
		return message.length > 0 ? message : "LLM adapter failed";
	} catch (_hostileThrownValue) {
		return "LLM adapter failed";
	}
}
/** Read a foreign error's own data-backed `code` without invoking accessors. */
function ownErrorCode(error) {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(error, "code");
		return descriptor !== void 0 && "value" in descriptor ? descriptor.value : void 0;
	} catch (_sdkPropertyTrap) {
		return;
	}
}
/** Snapshot an own data property without invoking an SDK-defined accessor. */
function ownFailureSnapshot(error) {
	try {
		const descriptor = Object.getOwnPropertyDescriptor(error, "failure");
		return descriptor !== void 0 && "value" in descriptor ? failureSnapshot(descriptor.value) : void 0;
	} catch (_sdkPropertyTrap) {
		return;
	}
}
/** Validate and detach an arbitrary serializable failure payload. */
function failureSnapshot(value) {
	if (typeof value !== "object" || value === null) return void 0;
	try {
		const candidate = value;
		const message = candidate.message;
		const code = candidate.code;
		const status = candidate.status;
		const providerRetryAfterMs = candidate.providerRetryAfterMs;
		const requestId = candidate.requestId;
		const offloadImages = candidate.offloadImages;
		if (typeof message !== "string" || message.length === 0 || typeof code !== "string" || code.length === 0 || status !== void 0 && (!Number.isInteger(status) || status < 100 || status > 599) || providerRetryAfterMs !== void 0 && (!Number.isFinite(providerRetryAfterMs) || providerRetryAfterMs <= 0) || requestId !== void 0 && (typeof requestId !== "string" || requestId.length === 0) || offloadImages !== void 0 && (!Number.isSafeInteger(offloadImages) || offloadImages <= 0)) return void 0;
		return Object.freeze({
			message,
			code,
			...status === void 0 ? {} : { status },
			...providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs },
			...requestId === void 0 ? {} : { requestId },
			...offloadImages === void 0 ? {} : { offloadImages }
		});
	} catch (_sdkFailureGetter) {
		return;
	}
}
/** Read an SDK error message without letting an accessor replace the primary failure. */
function errorMessage(error) {
	try {
		const message = error.message;
		if (typeof message === "string" && message.length > 0) return message;
	} catch (_sdkMessageGetter) {}
	return "LLM adapter failed";
}
/** Trust only Harness-owned codes; third-party SDK codes are not our taxonomy. */
function harnessErrorCode(error) {
	return error instanceof HarnessError ? error.code : "UNKNOWN";
}
function quoted(value) {
	return JSON.stringify(value);
}
/**
* Stable text shown to a model that cannot accept one durable image reference.
* @param ref - durable normalized attachment omitted from the request.
* @returns deterministic text-only placeholder.
*/
function textOnlyImageText(ref) {
	return `[image omitted because this model accepts text only; attachment sha256:${String(ref.attachmentId).slice(7, 15)}]`;
}
/**
* True when typed model content contains an image block. This is the one image
* walk shared by every image policy (capability gating, text-only
* serialization, compaction survey), so a consumer cannot silently diverge.
* @param content - typed model content blocks.
* @returns whether any block is an image.
*/
function contentHasImage(content) {
	return content.some((block) => block.type === "image");
}
/**
* True when typed model content contains a file block.
* Reads current content on every call without retaining scan results.
* @param content - typed model content blocks.
* @returns whether any block is a file.
*/
function contentHasFile(content) {
	for (const block of content) if (block.type === "file") return true;
	return false;
}
/**
* Stable model-facing handle for one durable file reference: the address of
* the verbatim stored copy and the instruction to read it on demand. This is
* the only representation a provider ever receives for a file.
* @param ref - durable verbatim file reference.
* @param readonlyPath - execution-world path of the stored copy, when resolvable.
* @returns deterministic handle text naming the file, its size, and its address.
*/
function fileHandleText(ref, readonlyPath) {
	const digest = String(ref.attachmentId).slice(7, 15);
	const identity = `File ${quoted(ref.name)} (${ref.bytes} bytes, sha256:${digest})`;
	if (readonlyPath === void 0) return `[${identity} was uploaded, but the current execution environment cannot access a readable path. Report that limitation if its contents are needed; do not claim to have read it.]`;
	return `[${identity}: verbatim read-only copy saved at ${quoted(readonlyPath)}. Read that path with your file tools when its contents are needed; copy it to a writable location before modifying it. When delegating file work, include this saved path in the delegation prompt; only subagents sharing this execution environment can read it.]`;
}
/** Replace every file occurrence with handle text. */
function replaceFilesWithHandles(blocks, resolvePath) {
	let next;
	for (const [index, block] of blocks.entries()) {
		if (block.type === "file") {
			next ??= blocks.slice(0, index);
			next.push({
				type: "text",
				text: fileHandleText(block.attachment, resolvePath(block.attachment))
			});
			continue;
		}
		next?.push(block);
	}
	return next ?? blocks;
}
function projectFilesToText(messages, resolvePath) {
	if (!messages.some((message) => contentHasFile(message.content))) return messages;
	return messages.map((message) => {
		const content = replaceFilesWithHandles(message.content, resolvePath);
		return content === message.content ? message : {
			...message,
			content
		};
	});
}
/** Replace every image occurrence for a text-only model. */
function replaceImagesForTextModel(blocks) {
	let next;
	for (const [index, block] of blocks.entries()) {
		if (block.type === "image") {
			next ??= blocks.slice(0, index);
			next.push({
				type: "text",
				text: textOnlyImageText(block.attachment)
			});
			continue;
		}
		next?.push(block);
	}
	return next ?? blocks;
}
function projectImagesForTextModel(messages) {
	if (!messages.some((message) => contentHasImage(message.content))) return messages;
	return messages.map((message) => {
		const content = replaceImagesForTextModel(message.content);
		return content === message.content ? message : {
			...message,
			content
		};
	});
}
/**
* Centralize the non-secret product identity every provider request sends as `User-Agent`, keeping
* adapters from drifting. See
* `.agents/notes/implemented/architecture/2026-06-21-mandatory-app-attribution-headers.md`.
*
* App-attribution vocabulary for provider requests.
* @module @deepseek-ai/dsh-llm/attribution
*/
const { version } = createRequire(import.meta.url)("../package.json");
/**
* LLM service: adapter registry with a waterfall-interceptable streaming call
* API. Exports the `LlmRuntime` default, the abstract `LlmAdapter` for
* provider backends, and `BlockAssembler` for chunk assembly.
*
* @module @deepseek-ai/dsh-llm
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/**
* Typed error for LLM-related failures. Extends {@link HarnessError}, so the
* `code` string (e.g. `AUTH`, `RATE_LIMIT`, `NO_ADAPTER`) is shared taxonomy.
*/
var LlmError = class extends HarnessError {
	/** Serializable facts retained beside this live Error. */
	failure;
	/**
	* @param message - non-empty human-readable failure summary.
	* @param code - non-empty stable provider-neutral machine code.
	* @param options - optional cause and validated serializable provider facts.
	*/
	constructor(message, code, options) {
		if (typeof message !== "string" || message.length === 0) throw new Error("LlmError message must be a non-empty string");
		if (typeof code !== "string" || code.length === 0) throw new Error("LlmError code must be a non-empty string");
		if (options?.status !== void 0 && (!Number.isInteger(options.status) || options.status < 100 || options.status > 599)) throw new Error("LlmError status must be an integer from 100 through 599");
		if (options?.providerRetryAfterMs !== void 0 && (!Number.isFinite(options.providerRetryAfterMs) || options.providerRetryAfterMs <= 0)) throw new Error("LlmError providerRetryAfterMs must be a positive finite number");
		if (options?.requestId !== void 0 && (typeof options.requestId !== "string" || options.requestId.length === 0)) throw new Error("LlmError requestId must be a non-empty string");
		super(message, code, options);
		this.name = "LlmError";
		this.failure = Object.freeze({
			message,
			code,
			...options?.status === void 0 ? {} : { status: options.status },
			...options?.providerRetryAfterMs === void 0 ? {} : { providerRetryAfterMs: options.providerRetryAfterMs },
			...options?.requestId === void 0 ? {} : { requestId: options.requestId },
			...options?.offloadImages === void 0 ? {} : { offloadImages: options.offloadImages }
		});
	}
};
(() => {
	let _classSuper = TypertRemoteService;
	let _instanceExtraInitializers = [];
	let _listProviders_decorators;
	let _listConfigurableProviders_decorators;
	let _remoteDiscoverModels_decorators;
	return class LlmRuntime extends _classSuper {
		static {
			const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
			_listProviders_decorators = [Remote];
			_listConfigurableProviders_decorators = [Remote];
			_remoteDiscoverModels_decorators = [Remote("discoverModels")];
			__esDecorate(this, null, _listProviders_decorators, {
				kind: "method",
				name: "listProviders",
				static: false,
				private: false,
				access: {
					has: (obj) => "listProviders" in obj,
					get: (obj) => obj.listProviders
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listConfigurableProviders_decorators, {
				kind: "method",
				name: "listConfigurableProviders",
				static: false,
				private: false,
				access: {
					has: (obj) => "listConfigurableProviders" in obj,
					get: (obj) => obj.listConfigurableProviders
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _remoteDiscoverModels_decorators, {
				kind: "method",
				name: "remoteDiscoverModels",
				static: false,
				private: false,
				access: {
					has: (obj) => "remoteDiscoverModels" in obj,
					get: (obj) => obj.remoteDiscoverModels
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		adapters = (__runInitializers(this, _instanceExtraInitializers), /* @__PURE__ */ new Map());
		directory = /* @__PURE__ */ new Map();
		discoveries = /* @__PURE__ */ new Map();
		constructor(ctx) {
			super(ctx, "llm");
		}
		/** Notify topology observers without letting one broken listener veto the commit. */
		emitAdaptersUpdated() {
			let invariantFailure;
			for (const listener of this.ctx.events.dispatch("emit", ["llm/adapters-updated"])) try {
				const returned = listener();
				if (returned != null && typeof returned.then === "function") Promise.resolve(returned).then(void 0, (error) => {
					this.warnAdaptersListenerFailure(error);
				});
			} catch (error) {
				if (error?.code === "INVARIANT") {
					invariantFailure ??= error;
					continue;
				}
				this.warnAdaptersListenerFailure(error);
			}
			if (invariantFailure !== void 0) throw invariantFailure;
		}
		/** Contained-listener diagnostic shared by the sync and async failure paths. */
		warnAdaptersListenerFailure(error) {
			this.ctx.logger.warn("llm: an llm/adapters-updated listener failed");
			this.ctx.logger.warn(error);
		}
		/**
		* Register an adapter for the given provider routes. Throws `LlmError` with code
		* `DUPLICATE_ADAPTER` if any provider already has an adapter (all-or-nothing).
		* Disposed with the fiber.
		* @param providers - every provider route this adapter should serve.
		* @param adapter - the adapter that streams calls for those providers.
		* @returns the disposer, carrying {@link AdapterRegistrationHandle.replace}.
		*/
		registerAdapter(providers, adapter) {
			const owned = /* @__PURE__ */ new Set();
			let released = false;
			const dispose = this.ctx.effect(function* () {
				if (providers.length === 0) throw new LlmError("an adapter must register at least one provider", "INVALID_ADAPTER");
				this.commitRoutes(owned, this.prepareRoutes(providers, adapter, owned));
				yield () => {
					released = true;
					for (const provider of owned) this.adapters.delete(provider);
					owned.clear();
					this.emitAdaptersUpdated();
				};
			}.bind(this), "llm.registerAdapter()");
			const handle = (() => void dispose());
			handle.replace = (next) => {
				if (released) throw new LlmError("a disposed adapter registration cannot replace its routes", "REGISTRATION_DISPOSED");
				this.commitRoutes(owned, this.prepareRoutes(next, adapter, owned));
			};
			return handle;
		}
		/**
		* Validate one candidate route set for `adapter`, treating routes this
		* registration already holds as available. Nothing is mutated: a rejected
		* candidate leaves the registry exactly as it was.
		*/
		prepareRoutes(providers, adapter, owned) {
			const unique = /* @__PURE__ */ new Set();
			const registrations = [];
			for (const provider of providers) {
				if (provider.length === 0) throw new LlmError("adapter provider names must be non-empty", "INVALID_ADAPTER");
				if (unique.has(provider) || this.adapters.has(provider) && !owned.has(provider)) throw new LlmError(`an adapter for provider "${provider}" is already registered`, "DUPLICATE_ADAPTER");
				const info = adapter.providerInfo(provider);
				if (typeof info.id !== "string" || info.id !== provider || typeof info.name !== "string" || info.name.length === 0) throw new LlmError(`adapter metadata for provider "${provider}" must preserve its id and have a non-empty name`, "INVALID_ADAPTER");
				unique.add(provider);
				const retryPolicy = adapter.providerRetryPolicy(provider) ?? resolveRetryPolicy(void 0, `llm: provider "${provider}" retryPolicy`);
				registrations.push({
					adapter,
					provider: {
						id: info.id,
						name: info.name
					},
					retryPolicy
				});
			}
			return registrations;
		}
		/**
		* Swap this registration's routes for the prepared ones in one synchronous
		* section, so no observer can see the registry between the release and the
		* re-registration. The route set's one mutation point is also where
		* `llm/adapters-updated` is published, so a `replace` announces itself
		* exactly like a first registration.
		*/
		commitRoutes(owned, registrations) {
			for (const provider of owned) this.adapters.delete(provider);
			owned.clear();
			for (const registration of registrations) {
				this.adapters.set(registration.provider.id, registration);
				owned.add(registration.provider.id);
			}
			this.emitAdaptersUpdated();
		}
		/**
		* Describe provider routes with a registered adapter.
		* @returns detached provider metadata in registration order.
		*/
		listProviders() {
			return [...this.adapters.values()].map(({ provider }) => ({ ...provider }));
		}
		/**
		* Declare provider routes an adapter plugin can activate through
		* configuration. Registration is all-or-nothing: an empty list, invalid
		* entry, or a provider already declared by any registration throws
		* `LlmError` without registering the rest. Disposed with the fiber.
		* @param entries - every configurable provider this plugin owns.
		* @returns a handle that withdraws all of them, and can atomically replace them.
		*/
		registerConfigurableProviders(entries) {
			let held = [];
			let disposed = false;
			/**
			* Validate a candidate set in full against everything this registration
			* does not already hold, then publish it. Nothing is written until the
			* whole set passes, so a refused candidate leaves the current entries in
			* place — the property that makes `replace` a swap rather than a
			* delete-then-add that can strand the directory empty.
			*/
			const commit = (candidates) => {
				const detached = [];
				const own = new Set(held.map((entry) => entry.provider));
				for (const entry of candidates) {
					if (entry.provider.length === 0 || entry.displayName.length === 0 || entry.settingsNs.length === 0) throw new LlmError("configurable providers need a non-empty provider, displayName, and settingsNs", "INVALID_DIRECTORY");
					if (entry.settingsPath.some((segment) => segment.length === 0)) throw new LlmError(`configurable provider "${entry.provider}" has an empty settingsPath segment`, "INVALID_DIRECTORY");
					if (this.directory.has(entry.provider) && !own.has(entry.provider) || detached.some((seen) => seen.provider === entry.provider)) throw new LlmError(`configurable provider "${entry.provider}" is already declared`, "DUPLICATE_DIRECTORY");
					detached.push({
						...entry,
						settingsPath: [...entry.settingsPath]
					});
				}
				for (const entry of held) this.directory.delete(entry.provider);
				for (const entry of detached) this.directory.set(entry.provider, entry);
				held = detached;
				this.emitAdaptersUpdated();
			};
			const dispose = this.ctx.effect(function* () {
				if (entries.length === 0) throw new LlmError("a configurable-provider registration must declare at least one provider", "INVALID_DIRECTORY");
				commit(entries);
				yield () => {
					disposed = true;
					for (const entry of held) this.directory.delete(entry.provider);
					held = [];
					this.emitAdaptersUpdated();
				};
			}.bind(this), "llm.registerConfigurableProviders()");
			const handle = (() => void dispose());
			handle.replace = (next) => {
				if (disposed) throw new LlmError("this configurable-provider registration was disposed", "REGISTRATION_DISPOSED");
				commit(next);
			};
			return handle;
		}
		/**
		* List every declared configurable provider, registered or dormant.
		* @returns detached directory entries in declaration order.
		*/
		listConfigurableProviders() {
			return [...this.directory.values()].map((entry) => ({
				...entry,
				settingsPath: [...entry.settingsPath]
			}));
		}
		/**
		* Offer to interrogate provider endpoints on behalf of the settings
		* namespace this plugin owns. The namespace is the key because that is what
		* a configuration surface already holds from the configurable-provider
		* directory, and because a provider being *added* has no route to name yet.
		* Disposed with the fiber.
		* @param settingsNs - the namespace whose profiles this discovery serves.
		* @param discover - interrogates one endpoint and must honor the supplied signal.
		* @returns the disposer that withdraws the offer.
		*/
		registerModelDiscovery(settingsNs, discover) {
			const dispose = this.ctx.effect(function* () {
				if (settingsNs.length === 0) throw new LlmError("model discovery needs a non-empty settings namespace", "INVALID_DISCOVERY");
				if (this.discoveries.has(settingsNs)) throw new LlmError(`model discovery for "${settingsNs}" is already registered`, "DUPLICATE_DISCOVERY");
				this.discoveries.set(settingsNs, discover);
				yield () => {
					this.discoveries.delete(settingsNs);
				};
			}.bind(this), "llm.registerModelDiscovery()");
			return () => void dispose();
		}
		/**
		* Interrogate one provider endpoint for the models it advertises. The
		* request describes a draft, not a stored route, so nothing here reads or
		* writes settings or credentials — the caller owns both, and the reply is
		* candidate metadata a surface may offer for adoption.
		* @param settingsNs - namespace whose registered discovery serves this draft.
		* @param request - the endpoint, protocol, and one-shot credential to use.
		* @param signal - caller cancellation.
		* @returns the advertised models, deduplicated in endpoint order.
		*/
		async discoverModels(settingsNs, request, signal) {
			const discover = this.discoveries.get(settingsNs);
			if (discover === void 0) throw new LlmError(`no model discovery is registered for "${settingsNs}"`, "NO_DISCOVERY");
			if ((request.provider ?? "").length === 0 && (request.baseURL ?? "").length === 0) throw new LlmError("model discovery needs a provider route or a baseURL", "INVALID_DISCOVERY");
			const discovered = signal === void 0 ? await discover(request) : await discover(request, signal);
			const seen = /* @__PURE__ */ new Set();
			const models = [];
			for (const model of discovered) {
				if (typeof model.id !== "string" || model.id.length === 0 || seen.has(model.id)) continue;
				seen.add(model.id);
				models.push({
					id: model.id,
					...model.name === void 0 ? {} : { name: model.name },
					...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
					...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens },
					...model.inputModalities === void 0 ? {} : { inputModalities: [...model.inputModalities] }
				});
			}
			return models;
		}
		/**
		* Remote adapter for one draft provider interrogation.
		* @param settingsNs - namespace whose registered discovery serves this draft.
		* @param request - endpoint, protocol, and one-shot credential to use.
		* @param signal - caller cancellation supplied by the Remote carrier.
		* @returns advertised models in endpoint order.
		* @throws RemoteError with `llm/model-discovery-rejected` when discovery refuses or fails.
		*/
		async remoteDiscoverModels(settingsNs, request, signal) {
			try {
				return await this.discoverModels(settingsNs, request, signal);
			} catch (error) {
				throw new RemoteError("llm/model-discovery-rejected", error instanceof Error ? error.message : String(error), {
					settingsNs,
					...request.baseURL === void 0 ? {} : { baseURL: request.baseURL }
				}, { cause: error });
			}
		}
		/**
		* Resolve the retry policy captured when one provider route was registered.
		* @param provider - registered provider route to inspect.
		* @returns the provider-owned policy, with normal defaults already resolved.
		*/
		providerRetryPolicy(provider) {
			return this.registration(provider).retryPolicy;
		}
		/**
		* Resolve provider-side request-image pricing for one exact route, or
		* `undefined` when the provider is unregistered or declares none. Unknown
		* providers degrade to `undefined` rather than throwing because callers
		* price durable history whose route may no longer be mounted.
		* @param provider - provider route named by a request header.
		* @param model - exact model id named by the same header.
		* @returns the owning adapter's image pricing for the route, when declared.
		*/
		imageRequestPricing(provider, model) {
			return this.adapters.get(provider)?.adapter.imageRequestPricing(provider, model);
		}
		/**
		* Resolve the exact text one durable file occurrence contributes to every
		* provider request in the current execution environment.
		* @param ref - durable verbatim file reference from model history.
		* @returns the same deterministic handle text used at adapter dispatch.
		*/
		fileRequestText(ref) {
			return fileHandleText(ref, this.fileReadPath(ref));
		}
		/** Detach typed adapter-owned modality metadata. */
		detachedModalities(modalities) {
			return modalities === void 0 ? void 0 : [...modalities];
		}
		/**
		* Discover models advertised by one registered provider. Catalog membership
		* is advisory and never changes routing or request validation.
		* @param provider - registered provider route to inspect.
		* @returns detached model metadata in adapter-preferred order.
		*/
		async listModels(provider) {
			const models = await this.registration(provider).adapter.listModels(provider);
			const seen = /* @__PURE__ */ new Set();
			return models.map((model) => {
				if (typeof model.provider !== "string" || model.provider !== provider || typeof model.id !== "string" || model.id.length === 0 || typeof model.name !== "string" || model.name.length === 0 || model.description !== void 0 && typeof model.description !== "string" || seen.has(model.id)) throw new LlmError(`adapter returned invalid or duplicate model metadata for provider "${provider}"`, "INVALID_CATALOG");
				seen.add(model.id);
				const inputModalities = this.detachedModalities(model.inputModalities);
				return {
					provider: model.provider,
					id: model.id,
					name: model.name,
					...model.description === void 0 ? {} : { description: model.description },
					...inputModalities === void 0 ? {} : { inputModalities }
				};
			});
		}
		/**
		* Resolve and validate all metadata from the adapter that owns one exact
		* route. The result is detached from adapter-owned objects; catalog
		* membership remains advisory and does not control request routing.
		* @param provider - registered provider route to inspect.
		* @param model - exact model id passed to the adapter.
		* @param signal - optional cancellation for adapter-owned asynchronous lookup.
		* @returns exact model identity plus available context and reasoning metadata.
		*/
		async resolveModelInfo(provider, model, signal) {
			return this.resolveModelInfoFor(this.registration(provider), model, signal);
		}
		async resolveModelInfoFor(registration, model, signal) {
			const resolved = await registration.adapter.resolveModel(registration.provider.id, model, signal);
			return this.normalizeModelInfo(registration, model, resolved);
		}
		/** Validate and detach one adapter-returned exact model result. */
		normalizeModelInfo(registration, model, resolved) {
			const provider = registration.provider.id;
			if (typeof resolved.provider !== "string" || resolved.provider !== provider || typeof resolved.id !== "string" || resolved.id !== model || typeof resolved.name !== "string" || resolved.name.length === 0 || resolved.description !== void 0 && typeof resolved.description !== "string") throw new LlmError(`adapter returned invalid exact model metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
			const context = resolved.context;
			if (context !== void 0 && (!Number.isInteger(context.contextWindow) || context.contextWindow <= 0)) throw new LlmError(`adapter returned invalid context metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_CONTEXT");
			const inputModalities = this.detachedModalities(resolved.inputModalities);
			const systemPromptUpdate = resolved.systemPromptUpdate;
			if (systemPromptUpdate !== void 0 && systemPromptUpdate !== "in-history") throw new LlmError(`adapter returned invalid system prompt update mode for provider "${provider}" model "${model}"`, "INVALID_MODEL_INFO");
			const defaultMaxTokens = resolved.defaultMaxTokens;
			if (defaultMaxTokens !== void 0 && (!Number.isSafeInteger(defaultMaxTokens) || defaultMaxTokens <= 0)) throw new LlmError(`adapter returned invalid default maxTokens for provider "${provider}" model "${model}"`, "INVALID_MODEL_MAX_TOKENS");
			const info = {
				provider,
				id: model,
				name: resolved.name,
				...resolved.description === void 0 ? {} : { description: resolved.description },
				...inputModalities === void 0 ? {} : { inputModalities },
				...context === void 0 ? {} : { context: { contextWindow: context.contextWindow } },
				...defaultMaxTokens === void 0 ? {} : { defaultMaxTokens },
				...resolved.systemPromptUpdate === void 0 ? {} : { systemPromptUpdate: resolved.systemPromptUpdate }
			};
			const reasoning = resolved.reasoning;
			if (reasoning === void 0) return info;
			if (reasoning.efforts.length === 0) throw new LlmError(`adapter returned invalid reasoning metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
			const seen = /* @__PURE__ */ new Set();
			const efforts = reasoning.efforts.map((effort) => {
				if (typeof effort.id !== "string" || effort.id.length === 0 || typeof effort.name !== "string" || effort.name.length === 0 || effort.description !== void 0 && typeof effort.description !== "string" || seen.has(effort.id)) throw new LlmError(`adapter returned invalid or duplicate reasoning effort metadata for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
				seen.add(effort.id);
				return {
					id: effort.id,
					name: effort.name,
					...effort.description === void 0 ? {} : { description: effort.description }
				};
			});
			if (reasoning.defaultEffort !== void 0 && !seen.has(reasoning.defaultEffort)) throw new LlmError(`adapter returned an unknown default reasoning effort for provider "${provider}" model "${model}"`, "INVALID_MODEL_REASONING");
			return {
				...info,
				reasoning: {
					efforts,
					...reasoning.defaultEffort === void 0 ? {} : { defaultEffort: reasoning.defaultEffort }
				}
			};
		}
		/**
		* Validate a conversation call config against its exact model capability and
		* materialize adapter-configured defaults. Unsupported explicit efforts
		* reject before provider I/O; no clamping or aliasing is performed. This
		* standalone query does not bind a later dispatch; use {@link prepareCall}
		* when logging and streaming must share one adapter registration.
		* @param config - provider/model route and optional request controls.
		* @param signal - optional cancellation for adapter-owned capability lookup.
		* @returns a detached config only when a default must be materialized.
		*/
		async resolveCallConfig(config, signal) {
			return (await this.resolveCallFor(this.registration(config.provider), config, signal)).config;
		}
		async resolveCallFor(registration, config, signal) {
			const info = await this.resolveModelInfoFor(registration, config.model, signal);
			return this.resolveCallWithInfo(config, info);
		}
		/** Validate request controls against one already-bound exact model result. */
		resolveCallWithInfo(config, info) {
			const defaulted = config.maxTokens === void 0 && info.defaultMaxTokens !== void 0 ? {
				...config,
				maxTokens: info.defaultMaxTokens
			} : config;
			const reasoning = info.reasoning;
			const requested = defaulted.reasoningEffort;
			let resolvedConfig = defaulted;
			if (reasoning === void 0) {
				if (requested !== void 0) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${requested}"`, "UNSUPPORTED_REASONING_EFFORT");
			} else {
				const effective = requested ?? reasoning.defaultEffort;
				if (effective !== void 0) {
					if (!reasoning.efforts.some((effort) => effort.id === effective)) throw new LlmError(`provider "${config.provider}" model "${config.model}" does not support reasoning effort "${effective}"`, "UNSUPPORTED_REASONING_EFFORT");
					if (requested !== effective) resolvedConfig = {
						...defaulted,
						reasoningEffort: effective
					};
				}
			}
			return {
				config: resolvedConfig,
				...info.context === void 0 ? {} : { context: info.context },
				modelInfo: info
			};
		}
		/**
		* Resolve one call under its current adapter registration. The returned
		* one-shot handle keeps that registration across header logging and dispatch,
		* so HMR cannot combine one adapter's capability result with another adapter.
		* @param config - provider/model route and optional request controls.
		* @param signal - optional cancellation for adapter-owned capability lookup.
		* @returns a prepared config and its registration-bound stream entry point.
		*/
		async prepareCall(config, signal) {
			const registration = this.registration(config.provider);
			const adapterCall = await registration.adapter.prepareCall(config.provider, config.model, signal);
			const modelInfo = this.normalizeModelInfo(registration, config.model, adapterCall.model);
			const resolved = this.resolveCallWithInfo(config, modelInfo);
			const resolvedConfig = deepFreeze(structuredClone(resolved.config));
			const context = resolved.context === void 0 ? void 0 : deepFreeze(structuredClone(resolved.context));
			const adapterDefaults = deepFreeze({
				...config.reasoningEffort === void 0 && resolvedConfig.reasoningEffort !== void 0 ? { reasoningEffort: true } : {},
				...config.maxTokens === void 0 && resolvedConfig.maxTokens !== void 0 ? { maxTokens: true } : {}
			});
			let dispatched = false;
			return Object.freeze({
				config: resolvedConfig,
				retryPolicy: registration.retryPolicy,
				adapterDefaults,
				...context === void 0 ? {} : { context },
				...modelInfo.inputModalities === void 0 ? {} : { inputModalities: Object.freeze([...modelInfo.inputModalities]) },
				...modelInfo.systemPromptUpdate === void 0 ? {} : { systemPromptUpdate: modelInfo.systemPromptUpdate },
				stream: (options) => {
					if (dispatched) throw new LlmError("a prepared LLM call can only be dispatched once", "INVALID_PREPARED_CALL");
					if (!callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
					dispatched = true;
					return this.streamWithRegistration(options, {
						registration,
						config: resolvedConfig,
						modelInfo,
						dispatch: (options) => adapterCall.stream(options)
					});
				}
			});
		}
		registration(provider) {
			const registration = this.adapters.get(provider);
			if (!registration) throw new LlmError(`no adapter registered for provider "${provider}"`, "NO_ADAPTER");
			return registration;
		}
		/** Remove replay state whose historical route is owned by another adapter. */
		forAdapter(options, adapter) {
			const messages = options.messages.map((message) => {
				if (message.role !== "assistant") return message;
				const source = message.source;
				if (source.replayState === void 0) return message;
				if (this.adapters.get(source.provider)?.adapter === adapter) return message;
				return freezeMessage({
					...message,
					source: {
						kind: "model",
						provider: source.provider,
						model: source.model
					}
				});
			});
			if (messages.every((message, index) => message === options.messages[index])) return options;
			const filtered = {
				...options,
				messages
			};
			return Object.isFrozen(options) ? deepFreeze(filtered) : filtered;
		}
		/**
		* Resolve the current execution-world read path of one durable file
		* reference through the mounted attachment and filesystem providers.
		*/
		fileReadPath(ref) {
			let hostPath;
			try {
				hostPath = this.ctx.get("attachments")?.fileHostPath(ref);
			} catch {
				return;
			}
			if (hostPath === void 0) return void 0;
			return this.ctx.get("fs")?.processPathFromHostPath(hostPath);
		}
		/**
		* Final adapter boundary. Adapter selection, dispatch, iterator construction,
		* and iteration failures become one terminal failure chunk. Middleware and
		* downstream consumer failures remain thrown plugin or consumer errors.
		*/
		async *adapterStream(options, prepared) {
			let iterator;
			try {
				const registration = prepared?.registration ?? this.registration(options.provider);
				const adapter = registration.adapter;
				let modelInfo;
				let resolvedConfig;
				let dispatch;
				if (prepared === void 0) {
					const adapterCall = await adapter.prepareCall(options.provider, options.model, options.signal);
					modelInfo = this.normalizeModelInfo(registration, options.model, adapterCall.model);
					resolvedConfig = this.resolveCallWithInfo(options, modelInfo).config;
					dispatch = (options) => adapterCall.stream(options);
				} else {
					modelInfo = prepared.modelInfo;
					resolvedConfig = prepared.config;
					dispatch = prepared.dispatch;
				}
				if (prepared !== void 0 && !callConfigEquals(options, resolvedConfig)) throw new LlmError("prepared LLM call config changed before adapter dispatch", "INVALID_PREPARED_CALL");
				const resolvedOptions = callConfigEquals(options, resolvedConfig) ? options : Object.isFrozen(options) ? deepFreeze({
					...options,
					...resolvedConfig
				}) : {
					...options,
					...resolvedConfig
				};
				let projectedMessages = resolvedOptions.messages;
				if (projectedMessages.some((message) => contentHasFile(message.content))) projectedMessages = projectFilesToText(projectedMessages, (ref) => this.fileReadPath(ref));
				if (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image") && projectedMessages.some((message) => contentHasImage(message.content))) projectedMessages = projectImagesForTextModel(projectedMessages);
				const projectedOptions = projectedMessages === resolvedOptions.messages ? resolvedOptions : Object.isFrozen(resolvedOptions) ? deepFreeze({
					...resolvedOptions,
					messages: projectedMessages
				}) : {
					...resolvedOptions,
					messages: projectedMessages
				};
				iterator = dispatch(this.forAdapter(projectedOptions, adapter))[Symbol.asyncIterator]();
			} catch (error) {
				yield adapterFailureChunk(error, options.signal);
				return;
			}
			let completed = false;
			try {
				while (true) {
					let item;
					try {
						const next = await iterator.next();
						item = next.done ? { done: true } : {
							done: false,
							value: next.value
						};
					} catch (error) {
						completed = true;
						yield adapterFailureChunk(error, options.signal);
						return;
					}
					if (item.done) {
						completed = true;
						return;
					}
					yield item.value;
				}
			} finally {
				if (!completed) {
					const close = iterator.return?.bind(iterator);
					if (close) await close();
				}
			}
		}
		/**
		* Stream one model call as raw chunks (token-level deltas). Replay state is
		* retained only when the same adapter instance owns its historical provider
		* and the target provider. Final adapter selection remains fixed through
		* asynchronous exact-model resolution and dispatch. Adapter selection,
		* dispatch, and iteration failures become terminal `error` or `aborted`
		* finish chunks; middleware, nested-call, cleanup, and consumer failures
		* remain thrown.
		* @param options - the full request; `options.provider` selects the adapter.
		* @returns the chunk stream, possibly wrapped by `llm/stream` listeners.
		*/
		stream(options) {
			return this.streamWithRegistration(options);
		}
		streamWithRegistration(options, prepared) {
			return this.ctx.waterfall(this, "llm/stream", options, () => this.adapterStream(options, prepared));
		}
	};
})();
/** Convert one adapter throw into the stream protocol's terminal outcome. */
function adapterFailureChunk(error, signal) {
	const failure = normalizeLlmFailure(error);
	return {
		type: "finish",
		reason: signal?.aborted || failure.code === "ABORTED" ? {
			kind: "aborted",
			failure
		} : {
			kind: "error",
			failure
		}
	};
}
//#endregion
//#region node_modules/.pnpm/@deepseek-ai+dsh-web@0.1.7-rc.1_@deepseek-ai+cordis@4.0.4_@deepseek-ai+dsh-llm@0.1.7-rc.1_@deepseek-ai+cordis@4.0.4_/node_modules/@deepseek-ai/dsh-web/lib/index.js
/**
* Vocabulary for the web capability seam (`ctx.web`). Search and fetch deliberately share one
* seam so provider selection, cancellation, errors, and product configuration have one owner,
* while retaining separate request and result types.
* @module @deepseek-ai/dsh-web/types
*/
/**
* Typed web error with a machine-routable, open-string `code` and chained `cause`.
* Consumers must tolerate provider-specific codes. Shared codes cover unavailable,
* missing, unusable, ambiguous, or duplicate providers, cancellation, and provider failure;
* the local fetch provider additionally distinguishes invalid or blocked URLs, redirects,
* size and timeout limits, and unsupported content types. Tool execution exposes the code in
* structured error metadata.
*/
var WebError = class extends HarnessError {};
/**
* Service Definition for the web access capability seam (`ctx.web`): registries and provider-selecting execution for search and
* fetch. Duplicate ids are rejected. At execution time, a configured provider must exist and
* be usable; without one, exactly one usable provider is required, so selection never depends
* on registration order.
* @module @deepseek-ai/dsh-web
*/
/**
* The web access service. Registered as `ctx.web` (one instance per context).
*
* Selection semantics (resolved at execution time, never order-dependent):
* - A configured id that is registered and `available()` → that provider.
* - A configured id not registered → `WEB_PROVIDER_CONFIGURED_MISSING`.
* - A configured id registered but unavailable →
*   `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`.
* - No id configured, exactly one registered usable provider → that provider.
* - No id configured, multiple usable providers → `WEB_PROVIDER_AMBIGUOUS`.
* - No id configured, no usable provider → `WEB_PROVIDER_UNAVAILABLE`.
*/
var WebRuntime = class extends Service {
	/**
	* Provider selection config. Operational env overrides feed the SAME fields:
	* `$DSH_WEB_SEARCH_PROVIDER` / `$DSH_WEB_FETCH_PROVIDER` are equivalent to
	* `searchProvider` / `fetchProvider` and are NOT a hidden priority chain.
	*/
	static Config = Schema.object({
		searchProvider: Schema.string(),
		fetchProvider: Schema.string()
	});
	searchProviders = /* @__PURE__ */ new Map();
	fetchProviders = /* @__PURE__ */ new Map();
	searchProviderId;
	fetchProviderId;
	constructor(ctx, config = {}) {
		super(ctx, "web");
		this.searchProviderId = config.searchProvider ?? process.env.DSH_WEB_SEARCH_PROVIDER;
		this.fetchProviderId = config.fetchProvider ?? process.env.DSH_WEB_FETCH_PROVIDER;
	}
	/**
	* Register a search provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
	* if its id is already registered for search. Returns a disposer; disposed
	* with the calling fiber.
	* @param provider - the provider; its `id` is the registry key.
	* @returns the disposer that unregisters the provider.
	*/
	registerSearchProvider(provider) {
		return this.registerProvider(this.searchProviders, provider);
	}
	/**
	* Register a fetch provider. Throws {@link WebError} `WEB_DUPLICATE_PROVIDER`
	* if its id is already registered for fetch. Returns a disposer; disposed
	* with the calling fiber.
	* @param provider - the provider; its `id` is the registry key.
	* @returns the disposer that unregisters the provider.
	*/
	registerFetchProvider(provider) {
		return this.registerProvider(this.fetchProviders, provider);
	}
	registerProvider(store, provider) {
		if (store.has(provider.id)) throw new WebError(`a web provider with id "${provider.id}" is already registered`, "WEB_DUPLICATE_PROVIDER");
		const dispose = this.ctx.effect(function* () {
			store.set(provider.id, provider);
			yield () => store.delete(provider.id);
		}, "web.registerProvider()");
		return () => void dispose();
	}
	/**
	* Run one search through the selected provider. Resolves the provider at call
	* time with the selection rules above; throws {@link WebError} when the
	* capability cannot run. The seam enforces `request.maxResults` on the result:
	* if the provider over-returns, `sources[]` is truncated and `truncated` set.
	* @param request - the query and optional result limit.
	* @param signal - optional cancellation signal forwarded to the provider.
	* @returns the provider's results, capped to `request.maxResults`.
	*/
	async search(request, signal) {
		return capSources(await resolveProvider({
			providers: this.searchProviders,
			...this.searchProviderId !== void 0 ? { configuredId: this.searchProviderId } : {}
		}).search(request, signal), request.maxResults);
	}
	/**
	* Retrieve one URL through the selected provider. Resolves the provider at
	* call time with the selection rules above; throws {@link WebError} when the
	* capability cannot run. A non-2xx response is a result, not a throw.
	* @param request - the URL plus retrieval options.
	* @param signal - optional cancellation signal forwarded to the provider.
	* @returns the retrieval outcome; non-2xx responses resolve descriptively.
	*/
	async fetch(request, signal) {
		return resolveProvider({
			providers: this.fetchProviders,
			...this.fetchProviderId !== void 0 ? { configuredId: this.fetchProviderId } : {}
		}).fetch(request, signal);
	}
};
/** Resolve the selected provider or throw the matching {@link WebError}. */
function resolveProvider(selection) {
	const { configuredId, providers } = selection;
	if (configuredId !== void 0) {
		const provider = providers.get(configuredId);
		if (!provider) throw new WebError(`configured web provider "${configuredId}" is not registered`, "WEB_PROVIDER_CONFIGURED_MISSING");
		if (!provider.available()) throw new WebError(`configured web provider "${configuredId}" is registered but unavailable`, "WEB_PROVIDER_CONFIGURED_UNAVAILABLE");
		return provider;
	}
	const usable = [...providers.values()].filter((provider) => provider.available());
	const [single] = usable;
	if (single === void 0) throw new WebError("no usable web provider is registered", "WEB_PROVIDER_UNAVAILABLE");
	if (usable.length > 1) throw new WebError(`multiple usable web providers are registered (${usable.map((provider) => provider.id).join(", ")}); configure one explicitly`, "WEB_PROVIDER_AMBIGUOUS");
	return single;
}
/** Enforce `maxResults` on a search result: truncate `sources[]` and flag it. */
function capSources(result, maxResults) {
	if (maxResults === void 0 || result.sources.length <= maxResults) return result;
	return {
		...result,
		sources: result.sources.slice(0, maxResults),
		truncated: true
	};
}
//#endregion
//#region src/backend-request-policy.ts
/** Shared, secret-free request policy for chatgpt.com/backend-api traffic. */
const OPENAI_CODEX_PLUGIN_ORIGINATOR = "deepseek-harness";
const OPENAI_CODEX_PLUGIN_USER_AGENT = "dsh-codex-connect";
/** Apply an honest plugin identity and a fresh per-attempt correlation id. */
function prepareOpenAICodexBackendHeaders(initial, identity, clientRequestId = randomUUID()) {
	const headers = new Headers(initial);
	headers.set("x-client-request-id", clientRequestId);
	if (identity === "plugin") {
		headers.set("originator", OPENAI_CODEX_PLUGIN_ORIGINATOR);
		headers.set("user-agent", OPENAI_CODEX_PLUGIN_USER_AGENT);
	} else if (identity === "probe") headers.set("user-agent", OPENAI_CODEX_PLUGIN_USER_AGENT);
	return {
		headers,
		clientRequestId
	};
}
//#endregion
//#region src/settings-contract.ts
/** Suggested local HTTP proxy shown by the settings UI; it is never enabled by default. */
const DEFAULT_OPENAI_CODEX_PROXY_URL = "http://127.0.0.1:7890";
/**
* Normalize the credential-free HTTP proxy URL accepted by Codex Connect.
* Paths, query strings, fragments, and embedded credentials are rejected so
* the value remains an origin rather than an opaque request target.
*/
function normalizeOpenAICodexProxyUrl(value) {
	if (typeof value !== "string" || value.trim().length === 0) return void 0;
	try {
		const parsed = new URL(value.trim());
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return void 0;
		if (parsed.username !== "" || parsed.password !== "") return void 0;
		if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") return void 0;
		if (parsed.hostname.length === 0) return void 0;
		if (parsed.port !== "" && (!/^\d+$/u.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65535)) return void 0;
		return parsed.origin;
	} catch {
		return;
	}
}
Object.freeze({
	models: void 0,
	enableProxy: false,
	proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
	contextWindowOverrides: void 0,
	enableSearch: false,
	enableReserveFallback: false,
	enableNativeCompaction: false,
	enableImageTool: false,
	enableImageGeneration: false,
	imageModelHint: "",
	autoReviewDisclosureAcknowledged: false,
	enableAutoReview: false,
	searchModel: "gpt-5.6-sol",
	searchMode: "cached",
	searchContextSize: "medium",
	searchMaxOutputTokens: 1e4
});
//#endregion
//#region src/search.ts
/** Trusted first-party Codex base; OAuth credentials never cross to a configured origin. */
const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
//#endregion
//#region src/undici-runtime.ts
/** Load npm Undici without replacing the dispatcher owned by Node's fetch. */
const LEGACY_GLOBAL_DISPATCHER = Symbol.for("undici.globalDispatcher.1");
const inheritedDispatcher = Reflect.get(globalThis, LEGACY_GLOBAL_DISPATCHER);
globalThis.WebSocket;
const undici = createRequire(import.meta.url)("undici");
if (inheritedDispatcher !== void 0) Reflect.set(globalThis, LEGACY_GLOBAL_DISPATCHER, inheritedDispatcher);
undici.Dispatcher;
/** Direct Undici agent loaded after preserving Node's dispatcher. */
const Agent = undici.Agent;
/** HTTP(S) proxy agent loaded after preserving Node's dispatcher. */
const ProxyAgent = undici.ProxyAgent;
/** Undici fetch loaded after preserving Node's dispatcher. */
const fetch$1 = undici.fetch;
undici.getGlobalDispatcher;
undici.setGlobalDispatcher;
//#endregion
//#region src/capability-probe.ts
/** A security limit, not a model output-token setting. */
const MAX_PROBE_RESPONSE_BYTES$1 = 65536;
function record$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function completedResponse$1(value, model) {
	if (!record$1(value) || value["status"] !== "completed" || !Array.isArray(value["output"])) return false;
	if (value["model"] !== model) return false;
	return value["output"].some((item) => record$1(item) && item["type"] === "message" && item["role"] === "assistant" && Array.isArray(item["content"]) && item["content"].some((part) => record$1(part) && part["type"] === "output_text" && typeof part["text"] === "string" && part["text"].trim().length > 0));
}
/** Inspect complete SSE frames, not substrings inside error text or schema errors. */
function completedStream$1(text, model) {
	let completed = false;
	let data = [];
	for (const line of text.split(/\r\n|\r|\n/u)) if (line === "") {
		if (data.length === 0) continue;
		const payload = data.join("\n");
		data = [];
		if (payload === "[DONE]") continue;
		let event;
		try {
			event = JSON.parse(payload);
		} catch {
			return false;
		}
		if (!record$1(event)) return false;
		if (event["type"] === "error" || event["type"] === "response.failed" || event["type"] === "response.incomplete") return false;
		if (event["type"] === "response.completed" || event["type"] === "response.done") {
			if (completed || !completedResponse$1(event["response"], model)) return false;
			completed = true;
		}
	} else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /u, ""));
	return completed && data.length === 0;
}
/**
* Send one fixed, stateless prompt to the first-party Responses endpoint.
* No refresh, redirects, retries, session ids, or optional capabilities are used.
* The deadline covers headers and EOF; owned sockets are destroyed before return.
* @param request - resolved model, OAuth credential, and network policy.
* @param createDispatcher - owned connection factory; tests use an offline dispatcher.
* @returns bounded evidence, never upstream body text or exception messages.
*/
async function probeCodexResponses(request, createDispatcher = (proxyUrl) => proxyUrl === void 0 ? new Agent() : new ProxyAgent(proxyUrl)) {
	const dispatcher = createDispatcher(request.proxyUrl);
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), request.timeoutMs);
	let httpStatus;
	try {
		const { headers } = prepareOpenAICodexBackendHeaders({
			authorization: `Bearer ${request.access}`,
			"chatgpt-account-id": request.accountId,
			"content-type": "application/json",
			accept: "text/event-stream"
		}, "plugin");
		const requestHeaders = {};
		headers.forEach((value, key) => {
			requestHeaders[key] = value;
		});
		const response = await fetch$1(`${OPENAI_CODEX_BASE_URL}/responses`, {
			dispatcher,
			method: "POST",
			redirect: "manual",
			signal: controller.signal,
			headers: requestHeaders,
			body: JSON.stringify({
				model: request.model,
				instructions: "You are a connectivity diagnostic. Reply with only ok.",
				input: [{
					role: "user",
					content: [{
						type: "input_text",
						text: "Reply with only ok."
					}]
				}],
				stream: true,
				store: false
			})
		});
		httpStatus = response.status;
		if (!response.ok) {
			await response.body?.cancel();
			return {
				outcome: [
					400,
					401,
					403,
					404,
					405,
					422
				].includes(httpStatus) ? "http-rejected" : "transient",
				httpStatus
			};
		}
		if (httpStatus !== 200 || !response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream") || response.body === null) {
			await response.body?.cancel();
			return {
				outcome: "incomplete",
				httpStatus
			};
		}
		const reader = response.body.getReader();
		const chunks = [];
		let size = 0;
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > MAX_PROBE_RESPONSE_BYTES$1) {
					await reader.cancel();
					return {
						outcome: "incomplete",
						httpStatus
					};
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
		return {
			outcome: completedStream$1(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), request.model) ? "completed" : "incomplete",
			httpStatus
		};
	} catch {
		return {
			outcome: controller.signal.aborted ? "timeout" : "network-error",
			...httpStatus === void 0 ? {} : { httpStatus }
		};
	} finally {
		clearTimeout(timer);
		await dispatcher.destroy();
	}
}
//#endregion
//#region src/capability-diagnostics.ts
/** Evidence-scoped diagnostics, separate from model routing and durable sessions. */
function result(status, reason, action) {
	return {
		status,
		reason,
		action
	};
}
function safeVersion(value) {
	return value !== null && value !== void 0 && /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(value) ? value : null;
}
function observed$1(evidence) {
	switch (evidence.outcome) {
		case "completed": return result("supported", "completed-response-for-selected-model", "This proves only the fixed standalone prompt; test the active Harness profile separately.");
		case "http-rejected": switch (evidence.httpStatus) {
			case 401: return result("rejected", "http-401", "Sign in again, then explicitly repeat the probe.");
			case 403: return result("rejected", "http-403", "Check account, model, and network access policy; signing in may not resolve a policy denial.");
			case 404: return result("rejected", "http-404", "The selected route was not found; check endpoint availability and plugin updates.");
			default: return result("rejected", "request-rejected", "The server rejected this diagnostic request; check the selected model and request compatibility. No optional capability was tested.");
		}
		case "transient": return result("unknown", "transient-or-redirect-response", "Check network, proxy, quota, or server availability before retrying; no provider fallback was attempted.");
		case "incomplete": return result("unknown", "no-complete-matching-response", "HTTP success or schema recognition is insufficient; repeat the probe after checking the endpoint and selected model.");
		case "timeout": return result("unknown", "probe-deadline", "The probe exceeded its deadline and may have consumed quota; check the network before retrying.");
		case "network-error": return result("unknown", "network-or-stream-error", "Check the network or pass an explicit --proxy; no server rejection was confirmed.");
	}
}
/**
* Reusable diagnostic operation with a single-entry, lazy-expiring memory cache.
* It registers no background hooks, expiry timers, or model-visible session events.
* The network provider owns its request deadline and connection cleanup.
* Cache identity includes credentials, model, network policy, and installed versions.
*/
var CodexCapabilityDiagnostics = class {
	cacheTtlMs;
	deps;
	cache;
	/**
	* @param cacheTtlMs - finite cache lifetime; zero disables reuse, maximum 60 seconds.
	* @param deps - owned metadata and probe operations; defaults perform local reads only until requested.
	*/
	constructor(cacheTtlMs, deps = {
		diagnose: diagnoseOpenAICodex,
		readVersion: readInstalledPackageVersion,
		catalog: openAICodexModelCatalog,
		credentials: new OpenAICodexCredentialStore(),
		probe: probeCodexResponses,
		now: Date.now
	}) {
		this.cacheTtlMs = cacheTtlMs;
		this.deps = deps;
		if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0 || cacheTtlMs > 6e4) throw new TypeError("Diagnostic cache lifetime must be between 0 and 60000 ms");
	}
	/**
	* Read metadata; optionally send one fixed request using an unexpired stored token.
	* No credential refresh/write occurs. Unsupported local versions prevent probing.
	* @param request - resolved command arguments, with explicit network consent.
	* @returns a secret-free report whose unknown entries never authorize a capability.
	*/
	async inspect(request) {
		const local = await this.deps.diagnose();
		const versions = { node: safeVersion(local.node) };
		for (const [name, entry] of Object.entries(local.compatibility.packages)) versions[name] = safeVersion(entry.installed);
		for (const name of DSH_PLUGIN_API_PACKAGES) versions[name] = safeVersion(await this.deps.readVersion(name));
		const compatibility = evaluateCompatibility({
			nodeVersion: versions["node"] ?? null,
			packageVersions: versions
		});
		const missing = Object.values(versions).some((value) => value === null) || !/^v?\d+\.\d+\.\d+$/u.test(versions["node"] ?? "");
		const dshVersion = versions["@deepseek-ai/dsh-llm"];
		const runtime = DSH_PLUGIN_API_PACKAGES.some((name) => versions[name] !== null && (!isSupportedDshPluginApiVersion(versions[name]) || versions[name] !== dshVersion)) || compatibility.status === "incompatible" || compatibility.status === "unverified" ? result("rejected", "declared-version-mismatch", "Use DSH plugin API 0.1.7-rc.1 with pi-ai 0.85.1, keeping every declared DSH API package at the same exact version. Older and mixed combinations are not verified by this candidate.") : missing || compatibility.status === "unknown" ? result("unknown", "version-metadata-unavailable", "Run this command from the plugin installation in the intended profile.") : result("supported", "declared-host-versions-match", "Host package versions satisfy the declared requirements; this is not a live profile or browser compatibility test.");
		const model = this.deps.catalog().find((item) => item.id === request.model)?.id ?? null;
		const unknownNetwork = result("unknown", "not-probed", "Run capabilities --model <catalog-id> --probe explicitly; this sends a fixed short request and may consume quota.");
		const checks = {
			runtime,
			oauth: local.credentialFile.state === "owner-only" ? result("unknown", "credential-metadata-only", "A private credential file does not prove authorization; use an explicit probe.") : result("rejected", "credential-file-unusable", "Sign in or repair owner-only credential-file permissions; no credential content was read."),
			responses: { ...unknownNetwork },
			transport: result("unknown", `configured-sse-not-probed`, unknownNetwork.action),
			model: model === null ? result(request.model === void 0 ? "unknown" : "rejected", "model-not-selected-from-catalog", "Select an exact model id from the installed Codex provider catalog; unknown ids are not probed.") : result("unknown", "catalog-is-not-entitlement", unknownNetwork.action),
			providerFallback: result("rejected", "no-automatic-provider-failover", "Select another provider explicitly. SSE is already selected; WebSocket-to-SSE fallback is inactive. Authentication, request, and partial-stream errors do not authorize provider switching."),
			contextManagement: result("unknown", "no-successful-optional-operation", "Schema recognition is not capability evidence; keep optional context management disabled."),
			continuation: result("unknown", "no-continuation-round-trip", "A stateless probe does not verify continuation, Fork, or restart; retain Harness-owned history."),
			nativeCompaction: result("rejected", "no-native-compaction-integration", "Keep Harness text-summary compaction; track the typed-operation and durable-replay prerequisites in Issue #65."),
			websocketReuse: result("rejected", "finite-sse-policy", "Keep finite SSE selected; cached WebSocket lifecycle work is outside this diagnostic.")
		};
		const report = {
			schemaVersion: 1,
			package: "dsh-codex-connect",
			version: CODEX_CONNECT_VERSION,
			scope: "standalone-route-only",
			model,
			network: request.proxyUrl === void 0 ? "direct" : "explicit-proxy",
			versions,
			checks,
			probe: { state: request.probe ? "skipped" : "not-requested" }
		};
		if (runtime.status !== "supported" || model === null || checks.oauth.status === "rejected") {
			this.cache = void 0;
			return report;
		}
		if (!request.probe) return report;
		let credential;
		try {
			credential = await this.deps.credentials.read(OPENAI_CODEX_PROVIDER);
		} catch {
			checks.oauth = result("rejected", "credential-unreadable", "Repair the credential file or sign in again; diagnostic output omits parser details.");
			this.cache = void 0;
			return report;
		}
		if (credential?.type !== "oauth" || typeof credential.accountId !== "string") {
			checks.oauth = result("rejected", "credential-missing", "Sign in before explicitly probing the route.");
			this.cache = void 0;
			return report;
		}
		if (credential.expires <= this.deps.now()) {
			checks.oauth = result("unknown", "access-token-expired", "Use the normal sign-in or refresh flow, then repeat the probe; diagnostics never refresh or write credentials.");
			this.cache = void 0;
			return report;
		}
		const key = createHash("sha256").update(JSON.stringify([
			credential.access,
			credential.accountId,
			model,
			request.proxyUrl,
			request.timeoutMs,
			versions
		])).digest("hex");
		const cached = this.cache;
		const age = cached === void 0 ? Infinity : this.deps.now() - cached.observedAt;
		let evidence;
		if (cached?.key === key && age >= 0 && age < this.cacheTtlMs) {
			evidence = cached.evidence;
			report.probe = {
				state: "cached",
				observedAt: cached.observedAt
			};
		} else {
			this.cache = void 0;
			evidence = await this.deps.probe({
				model,
				access: credential.access,
				accountId: credential.accountId,
				proxyUrl: request.proxyUrl,
				timeoutMs: request.timeoutMs
			});
			const observedAt = this.deps.now();
			report.probe = {
				state: "fresh",
				observedAt
			};
			if (evidence.outcome === "completed" || evidence.outcome === "http-rejected") this.cache = {
				key,
				observedAt,
				evidence
			};
		}
		if (evidence.httpStatus !== void 0) report.probe.httpStatus = evidence.httpStatus;
		checks.responses = observed$1(evidence);
		checks.transport = { ...checks.responses };
		if (evidence.outcome === "completed") {
			checks.oauth = result("supported", "authorized-completed-response", "Authorization succeeded for this model and fixed request at the recorded time only.");
			checks.model = { ...checks.responses };
		} else if (evidence.httpStatus === 401 || evidence.httpStatus === 403) checks.oauth = { ...checks.responses };
		return report;
	}
};
//#endregion
//#region src/capability-cli.ts
/** Opt-in standalone capability diagnostics; ordinary doctor output stays unchanged. */
/**
* Run the separate capability command without booting Harness or changing settings.
* @param args - flags after capabilities; unknown or unsafe flags are not echoed.
* @returns 0 for supported primary checks, 1 for rejection, or 2 for unknown/invalid input.
*/
async function runCapabilityCommand(args) {
	const request = {
		model: void 0,
		probe: false,
		proxyUrl: void 0,
		timeoutMs: 3e4
	};
	let json = false;
	const seen = /* @__PURE__ */ new Set();
	const invalid = () => {
		process.stderr.write("Usage: dsh-codex-connect capabilities [--model <catalog-id>] [--probe] [--proxy <http(s)-origin>] [--timeout-ms <1..60000>] [--json]\n");
		return 2;
	};
	for (let index = 0; index < args.length; index += 1) {
		const flag = args[index];
		if (seen.has(flag)) return invalid();
		seen.add(flag);
		if (flag === "--json") json = true;
		else if (flag === "--probe") request.probe = true;
		else if (flag === "--model" || flag === "--proxy" || flag === "--timeout-ms") {
			const value = args[++index];
			if (value === void 0 || value.startsWith("--")) return invalid();
			if (flag === "--model") request.model = value;
			if (flag === "--proxy") {
				request.proxyUrl = normalizeOpenAICodexProxyUrl(value);
				if (request.proxyUrl === void 0) return invalid();
			}
			if (flag === "--timeout-ms") {
				if (!/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > 6e4) return invalid();
				request.timeoutMs = Number(value);
			}
		} else return invalid();
	}
	if (request.probe && request.model === void 0) return invalid();
	try {
		const report = await new CodexCapabilityDiagnostics(6e4).inspect(request);
		process.stdout.write(json ? `${JSON.stringify(report)}\n` : [
			`Codex Connect ${report.version}: standalone route diagnostics`,
			"Scope: local host versions and the selected standalone route; not the active Harness profile.",
			`Model: ${report.model ?? "not selected from catalog"}; network: ${report.network}; probe: ${report.probe.state}`,
			...Object.entries(report.checks).map(([id, check]) => `${id}: ${check.status} (${check.reason})\n  ${check.action}`),
			""
		].join("\n"));
		const primary = [
			report.checks.runtime,
			report.checks.oauth,
			report.checks.responses,
			report.checks.transport,
			report.checks.model
		];
		return primary.some((check) => check.status === "rejected") ? 1 : primary.some((check) => check.status === "unknown") ? 2 : 0;
	} catch {
		process.stderr.write("Codex Connect diagnostics could not inspect this installation. Check local package and credential-file access.\n");
		return 2;
	}
}
//#endregion
//#region src/auto-review-probe.ts
/** Hidden reviewer route selected by the first-party Codex catalog. */
const CODEX_AUTO_REVIEW_MODEL = "codex-auto-review";
/** A response-reading limit, not a model output-token setting. */
const MAX_PROBE_RESPONSE_BYTES = 65536;
const instructions = "This is a capability diagnostic. Do not call tools or execute any action. Return one strict JSON assessment for the supplied synthetic approval request, including risk_level, user_authorization, outcome, and rationale.";
const input = "Synthetic approval request only; nothing will be executed. Planned action JSON: {\"type\":\"diagnostic-no-op\",\"sideEffects\":false}";
const assessmentSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		risk_level: {
			type: "string",
			enum: [
				"low",
				"medium",
				"high",
				"critical"
			]
		},
		user_authorization: {
			type: "string",
			enum: [
				"unknown",
				"low",
				"medium",
				"high"
			]
		},
		outcome: {
			type: "string",
			enum: ["allow", "deny"]
		},
		rationale: { type: "string" }
	},
	required: [
		"risk_level",
		"user_authorization",
		"outcome",
		"rationale"
	]
};
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assessment(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		return false;
	}
	if (!record(value)) return false;
	if (Object.keys(value).some((key) => ![
		"risk_level",
		"user_authorization",
		"outcome",
		"rationale"
	].includes(key))) return false;
	if (![
		"low",
		"medium",
		"high",
		"critical"
	].includes(String(value["risk_level"]))) return false;
	if (![
		"unknown",
		"low",
		"medium",
		"high"
	].includes(String(value["user_authorization"]))) return false;
	if (!["allow", "deny"].includes(String(value["outcome"]))) return false;
	return typeof value["rationale"] === "string";
}
function completedResponse(value) {
	if (!record(value) || value["status"] !== "completed" || typeof value["model"] !== "string" || !Array.isArray(value["output"])) return void 0;
	return value["output"].flatMap((item) => record(item) && item["type"] === "message" && item["role"] === "assistant" && Array.isArray(item["content"]) ? item["content"].flatMap((part) => record(part) && part["type"] === "output_text" && typeof part["text"] === "string" ? [part["text"]] : []) : []);
}
/** Inspect complete SSE frames and accept exactly one matching terminal response. */
function completedStream(text) {
	let completed = false;
	let terminalTexts;
	const streamedTexts = [];
	let data = [];
	for (const line of text.split(/\r\n|\r|\n/u)) if (line === "") {
		if (data.length === 0) continue;
		const payload = data.join("\n");
		data = [];
		if (payload === "[DONE]") continue;
		let event;
		try {
			event = JSON.parse(payload);
		} catch {
			return false;
		}
		if (!record(event) || event["type"] === "error" || event["type"] === "response.failed" || event["type"] === "response.incomplete") return false;
		if (event["type"] === "response.output_text.done") {
			if (typeof event["text"] !== "string") return false;
			streamedTexts.push(event["text"]);
		}
		if (event["type"] === "response.completed" || event["type"] === "response.done") {
			terminalTexts = completedResponse(event["response"]);
			if (completed || terminalTexts === void 0) return false;
			completed = true;
		}
	} else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /u, ""));
	if (!completed || data.length !== 0) return false;
	const texts = terminalTexts.length > 0 ? terminalTexts : streamedTexts;
	return texts.length === 1 && assessment(texts[0]);
}
/**
* Send one secret-free synthetic approval to the hidden reviewer model.
* The result is evidence only and never authorizes or executes an action.
* @param request - OAuth credential, explicit network policy, deadline, and optional cancellation.
* @param createDispatcher - owned connection factory; tests use an offline dispatcher.
* @returns bounded evidence without model-generated or provider error text.
*/
async function probeCodexAutoReview(request, createDispatcher = (proxyUrl) => proxyUrl === void 0 ? new Agent() : new ProxyAgent(proxyUrl)) {
	const dispatcher = createDispatcher(request.proxyUrl);
	const controller = new AbortController();
	let timedOut = false;
	let cancelled = request.signal?.aborted ?? false;
	const cancel = () => {
		cancelled = true;
		controller.abort();
	};
	request.signal?.addEventListener("abort", cancel, { once: true });
	if (cancelled) controller.abort();
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, request.timeoutMs);
	let httpStatus;
	try {
		const { headers } = prepareOpenAICodexBackendHeaders({
			authorization: `Bearer ${request.access}`,
			"chatgpt-account-id": request.accountId,
			"content-type": "application/json",
			accept: "text/event-stream"
		}, "plugin");
		const requestHeaders = {};
		headers.forEach((value, key) => {
			requestHeaders[key] = value;
		});
		const response = await fetch$1(`${OPENAI_CODEX_BASE_URL}/responses`, {
			dispatcher,
			method: "POST",
			redirect: "manual",
			signal: controller.signal,
			headers: requestHeaders,
			body: JSON.stringify({
				model: CODEX_AUTO_REVIEW_MODEL,
				instructions,
				input: [{
					role: "user",
					content: [{
						type: "input_text",
						text: input
					}]
				}],
				text: { format: {
					type: "json_schema",
					name: "codex_auto_review_assessment",
					strict: true,
					schema: assessmentSchema
				} },
				stream: true,
				store: false
			})
		});
		httpStatus = response.status;
		if (!response.ok) {
			await response.body?.cancel();
			return {
				outcome: [
					400,
					401,
					403,
					404,
					405,
					422
				].includes(httpStatus) ? "http-rejected" : "transient",
				httpStatus
			};
		}
		const contentType = response.headers.get("content-type");
		if (httpStatus !== 200 || contentType !== null && !contentType.toLowerCase().startsWith("text/event-stream") || response.body === null) {
			await response.body?.cancel();
			return {
				outcome: "incomplete",
				httpStatus
			};
		}
		const reader = response.body.getReader();
		const chunks = [];
		let size = 0;
		try {
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				size += value.byteLength;
				if (size > MAX_PROBE_RESPONSE_BYTES) {
					await reader.cancel();
					return {
						outcome: "incomplete",
						httpStatus
					};
				}
				chunks.push(value);
			}
		} finally {
			reader.releaseLock();
		}
		return {
			outcome: completedStream(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) ? "completed" : "incomplete",
			httpStatus
		};
	} catch {
		return {
			outcome: cancelled ? "cancelled" : timedOut ? "timeout" : "network-error",
			...httpStatus === void 0 ? {} : { httpStatus }
		};
	} finally {
		clearTimeout(timer);
		request.signal?.removeEventListener("abort", cancel);
		await dispatcher.destroy();
	}
}
//#endregion
//#region src/auto-review-cli.ts
/** Opt-in diagnostic for the hidden Codex approval reviewer. */
function check(status, reason, action) {
	return {
		status,
		reason,
		action
	};
}
function observed(evidence) {
	switch (evidence.outcome) {
		case "completed": return check("supported", "completed-structured-review", "The OAuth route accepted the hidden reviewer and returned its approval schema; this does not enable DSH approval integration.");
		case "http-rejected": return check("rejected", `http-${String(evidence.httpStatus ?? "rejected")}`, "The supported OAuth route rejected this hidden reviewer request; keep automatic approval disabled.");
		case "transient": return check("unknown", "transient-or-redirect-response", "Check network, quota, or service availability before explicitly retrying.");
		case "incomplete": return check("unknown", "no-complete-structured-review", "HTTP success without one matching structured assessment is not capability evidence.");
		case "timeout": return check("unknown", "probe-deadline", "The diagnostic exceeded its deadline; no approval capability was established.");
		case "cancelled": return check("unknown", "probe-cancelled", "The diagnostic was cancelled; no approval capability was established.");
		case "network-error": return check("unknown", "network-or-stream-error", "Check the network or pass an explicit --proxy; no server decision was confirmed.");
	}
}
/** Run the standalone reviewer probe without booting Harness or changing settings. */
async function runAutoReviewProbeCommand(args, deps = {
	diagnose: diagnoseOpenAICodex,
	credentials: new OpenAICodexCredentialStore(),
	probe: probeCodexAutoReview,
	now: Date.now
}) {
	let json = false;
	let proxyUrl;
	let timeoutMs = 3e4;
	const seen = /* @__PURE__ */ new Set();
	const invalid = () => {
		process.stderr.write("Usage: dsh-codex-connect auto-review-probe [--proxy <http(s)-origin>] [--timeout-ms <1..60000>] [--json]\n");
		return 2;
	};
	for (let index = 0; index < args.length; index += 1) {
		const flag = args[index];
		if (seen.has(flag)) return invalid();
		seen.add(flag);
		if (flag === "--json") json = true;
		else if (flag === "--proxy" || flag === "--timeout-ms") {
			const value = args[++index];
			if (value === void 0 || value.startsWith("--")) return invalid();
			if (flag === "--proxy") {
				proxyUrl = normalizeOpenAICodexProxyUrl(value);
				if (proxyUrl === void 0) return invalid();
			} else {
				if (!/^\d+$/u.test(value) || Number(value) < 1 || Number(value) > 6e4) return invalid();
				timeoutMs = Number(value);
			}
		} else return invalid();
	}
	const local = await deps.diagnose();
	const runtime = local.compatibility.status === "compatible" ? check("supported", "declared-host-versions-match", "Installed package versions satisfy the probe prerequisites; this is not active-profile validation.") : check(local.compatibility.status === "incompatible" ? "rejected" : "unknown", "runtime-compatibility-unavailable", "Install the supported Codex Connect and DSH package set before probing.");
	let oauth = local.credentialFile.state === "owner-only" ? check("unknown", "credential-metadata-only", "An owner-only file does not prove authorization; the explicit probe reads its unexpired stored credential.") : check("rejected", "credential-file-unusable", "Sign in or repair the owner-only credential file before probing.");
	let reviewer = check("unknown", "not-probed", "Run this command explicitly only when one fixed diagnostic request is acceptable.");
	let probe = { state: "skipped" };
	if (runtime.status === "supported" && oauth.status !== "rejected") {
		let credential;
		try {
			credential = await deps.credentials.read(OPENAI_CODEX_PROVIDER);
		} catch {
			oauth = check("rejected", "credential-unreadable", "Repair the credential file or sign in again; diagnostic output omits parser details.");
		}
		if (credential?.type !== "oauth" || typeof credential.accountId !== "string") {
			if (oauth.reason !== "credential-unreadable") oauth = check("rejected", "credential-missing", "Sign in before explicitly probing the hidden reviewer.");
		} else if (credential.expires <= deps.now()) oauth = check("unknown", "access-token-expired", "Use the normal sign-in or refresh flow, then repeat the probe; diagnostics never refresh credentials.");
		else {
			let evidence;
			try {
				evidence = await deps.probe({
					access: credential.access,
					accountId: credential.accountId,
					proxyUrl,
					timeoutMs
				});
			} catch {
				evidence = { outcome: "network-error" };
			}
			probe = {
				state: "fresh",
				...evidence.httpStatus === void 0 ? {} : { httpStatus: evidence.httpStatus }
			};
			reviewer = observed(evidence);
			if (evidence.outcome === "completed") oauth = check("supported", "authorized-completed-review", "Authorization succeeded for this fixed reviewer request at the recorded time only.");
			else if (evidence.httpStatus === 401) oauth = check("rejected", "http-401", "Sign in again, then explicitly repeat the probe.");
		}
	}
	const report = {
		schemaVersion: 1,
		package: "dsh-codex-connect",
		version: CODEX_CONNECT_VERSION,
		scope: "auto-review-route-only",
		model: CODEX_AUTO_REVIEW_MODEL,
		network: proxyUrl === void 0 ? "direct" : "explicit-proxy",
		checks: {
			runtime,
			oauth,
			reviewer
		},
		probe
	};
	process.stdout.write(json ? `${JSON.stringify(report)}\n` : [
		`Codex Connect ${report.version}: hidden approval-review capability probe`,
		"Scope: one synthetic no-op; no command is executed and no approval integration is enabled.",
		`Model: ${report.model}; network: ${report.network}; probe: ${report.probe.state}`,
		...Object.entries(report.checks).map(([id, value]) => `${id}: ${value.status} (${value.reason})\n  ${value.action}`),
		""
	].join("\n"));
	const primary = [
		runtime,
		oauth,
		reviewer
	];
	return primary.some((value) => value.status === "rejected") ? 1 : primary.some((value) => value.status === "unknown") ? 2 : 0;
}
//#endregion
//#region src/bin.ts
/** Standalone credential CLI for the optional OpenAI Codex bundle. */
const JSON_SCHEMA_VERSION = 1;
/** Open one trusted HTTPS URL with the platform browser, best effort. */
function openBrowser(rawUrl) {
	const url = new URL(rawUrl);
	if (url.protocol !== "https:") throw new Error(`refusing to open non-HTTPS authorization URL from ${url.host}`);
	const command = process.platform === "win32" ? {
		file: "rundll32.exe",
		args: ["url.dll,FileProtocolHandler", url.href]
	} : process.platform === "darwin" ? {
		file: "open",
		args: [url.href]
	} : {
		file: "xdg-open",
		args: [url.href]
	};
	try {
		const child = spawn(command.file, command.args, {
			detached: true,
			stdio: "ignore",
			windowsHide: true
		});
		child.on("error", () => {});
		child.unref();
	} catch {}
}
/** Render one provider event without exposing stored credentials. */
function notify(event, useBrowser) {
	switch (event.type) {
		case "auth_url":
			process.stdout.write(`Open this URL to sign in:\n${event.url}\n`);
			if (event.instructions !== void 0) process.stdout.write(`${event.instructions}\n`);
			if (useBrowser) openBrowser(event.url);
			break;
		case "device_code":
			process.stdout.write(`Open this URL to sign in:\n${event.verificationUri}\nEnter code: ${event.userCode}\n`);
			if (useBrowser) openBrowser(event.verificationUri);
			break;
		case "info":
		case "progress": process.stdout.write(`${event.message}\n`);
	}
}
/** Answer a provider auth prompt through the terminal. */
async function answerPrompt(prompt, deviceCode, question) {
	if (prompt.type === "select") {
		const wanted = deviceCode ? "device_code" : "browser";
		if (!prompt.options.some((option) => option.id === wanted)) throw new Error(`OpenAI Codex login did not offer the requested ${wanted} method`);
		return wanted;
	}
	const suffix = prompt.placeholder === void 0 ? "" : ` (${prompt.placeholder})`;
	return question(`${prompt.message}${suffix}: `, { ...prompt.signal === void 0 ? {} : { signal: prompt.signal } });
}
/** Print the standalone command help. */
function printHelp() {
	process.stdout.write([
		"Usage: dsh-codex-connect <doctor|login|logout|status> [--device-code|--json]",
		"       dsh-codex-connect doctor [--install-anchor <absolute-dsh-package.json>] [--json]",
		"       dsh-codex-connect migrate-history [--apply --confirm-stopped] [--root <path>] [--json]",
		"       dsh-codex-connect trust-origin <origin>",
		"       dsh-codex-connect trusted-origins [--json]",
		"       dsh-codex-connect untrust-origin <origin>",
		"       dsh-codex-connect capabilities [--model <catalog-id>] [--probe] [--proxy <http(s)-origin>] [--timeout-ms <1..60000>] [--json]",
		"       dsh-codex-connect auto-review-probe [--proxy <http(s)-origin>] [--timeout-ms <1..60000>] [--json]",
		"",
		"  doctor         inspect secret-free runtime and OAuth file metadata; an explicit DSH anchor verifies host package versions",
		"  auto-review-probe test the hidden approval reviewer with one synthetic no-op",
		"  login          sign in with a separate ChatGPT OAuth session",
		"  logout         remove the dsh credential without changing ~/.codex",
		"  migrate-history find or repair Alpha 4.10 private search events (dry-run by default)",
		"  status         report non-secret dsh credential state",
		"  trust-origin   allow one exact browser origin to reach Web OAuth routes",
		"  trusted-origins list the currently allowed browser origins",
		"  untrust-origin remove one exact browser origin from the allowlist",
		"  --device-code  use headless device-code login (login only)",
		"  --json         emit one JSON document (doctor/status/capabilities/auto-review-probe/trusted-origins/migrate-history)",
		""
	].join("\n"));
}
function doctorExitCode(report) {
	const credentialFailure = report.credentialFile.state === "permissions-too-broad" || report.credentialFile.state === "not-a-regular-file" || report.credentialFile.state === "unreadable-metadata";
	const compatibilityFailure = report.compatibility !== void 0 && report.compatibility.status !== "compatible";
	return credentialFailure || compatibilityFailure ? 1 : 0;
}
/** Project the diagnostic report without its absolute credential pathname. */
function doctorJson(report) {
	const result = {
		schemaVersion: JSON_SCHEMA_VERSION,
		package: report.package,
		version: report.version,
		node: report.node,
		credentialFile: {
			state: report.credentialFile.state,
			...report.credentialFile.mode === void 0 ? {} : { mode: report.credentialFile.mode }
		},
		capabilities: report.capabilities,
		providerConflict: report.providerConflict,
		hints: report.hints
	};
	if (report.compatibility !== void 0) result.compatibility = report.compatibility;
	return result;
}
function printJson(value) {
	process.stdout.write(`${JSON.stringify(value)}\n`);
}
/** Execute one boot-free credential command. */
async function run(argv) {
	if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
		printHelp();
		return 0;
	}
	const [rawAction, ...flags] = argv;
	if (rawAction === "capabilities") return runCapabilityCommand(flags);
	if (rawAction === "auto-review-probe") return runAutoReviewProbeCommand(flags);
	if (![
		"doctor",
		"login",
		"logout",
		"migrate-history",
		"status",
		"trust-origin",
		"trusted-origins",
		"untrust-origin"
	].includes(rawAction)) {
		process.stderr.write(`dsh-codex-connect: expected doctor, login, logout, migrate-history, status, trust-origin, trusted-origins, or untrust-origin; got ${JSON.stringify(rawAction)}\n`);
		return 1;
	}
	const action = rawAction;
	const originArgument = action === "trust-origin" || action === "untrust-origin" ? flags[0] : void 0;
	const optionFlags = action === "trust-origin" || action === "untrust-origin" ? flags.slice(1) : flags;
	const deviceCode = optionFlags.includes("--device-code");
	const jsonOutput = optionFlags.includes("--json");
	let migrationRoot;
	let installAnchor;
	let migrationApply = false;
	let migrationConfirmStopped = false;
	const unknown = [];
	if (action === "doctor") for (let index = 0; index < optionFlags.length; index += 1) {
		const flag = optionFlags[index];
		if (flag === "--json") continue;
		if (flag === "--install-anchor" && installAnchor === void 0) {
			const value = optionFlags[index + 1];
			if (value !== void 0 && isAbsolute(value) && basename(value) === "package.json") {
				installAnchor = value;
				index += 1;
				continue;
			}
		}
		unknown.push(flag ?? "");
	}
	else if (action === "migrate-history") for (let index = 0; index < optionFlags.length; index += 1) {
		const flag = optionFlags[index];
		if (flag === "--apply") {
			if (migrationApply) unknown.push(flag ?? "");
			migrationApply = true;
		} else if (flag === "--confirm-stopped") {
			if (migrationConfirmStopped) unknown.push(flag ?? "");
			migrationConfirmStopped = true;
		} else if (flag === "--json") {} else if (flag === "--root" && migrationRoot === void 0 && optionFlags[index + 1] !== void 0 && !optionFlags[index + 1]?.startsWith("--")) {
			migrationRoot = optionFlags[index + 1];
			index += 1;
		} else unknown.push(flag ?? "");
	}
	else unknown.push(...optionFlags.filter((flag) => flag !== "--device-code" && flag !== "--json"));
	if (unknown.length > 0 || deviceCode && action !== "login" || jsonOutput && (action === "login" || action === "logout" || deviceCode) || action === "migrate-history" && (migrationConfirmStopped && !migrationApply || migrationApply && !migrationConfirmStopped) || (action === "trust-origin" || action === "untrust-origin") && (originArgument === void 0 || optionFlags.length !== 0)) {
		process.stderr.write(`dsh-codex-connect: invalid options for ${action}\n`);
		return 1;
	}
	try {
		switch (action) {
			case "doctor": {
				const report = await diagnoseOpenAICodex(installAnchor === void 0 ? void 0 : { compatibilityOptions: { installAnchor } });
				if (jsonOutput) {
					printJson(doctorJson(report));
					return doctorExitCode(report);
				}
				process.stdout.write([
					`Codex Connect ${report.version} on ${report.node}`,
					`OAuth file metadata: ${report.credentialFile.state} (${report.credentialFile.path})`,
					...report.compatibility === void 0 ? [] : [`Compatibility: ${report.compatibility.status} (Node ${report.compatibility.node.installed ?? "unknown"}; DSH API ${report.compatibility.packages["@deepseek-ai/dsh-llm"].installed ?? "unknown"}; pi-ai ${report.compatibility.packages["@earendil-works/pi-ai"].installed ?? "unknown"})`],
					`Optional capability defaults: search=${report.capabilities.search ? "enabled" : "disabled"}, imageTool=${report.capabilities.imageTool ? "enabled" : "disabled"}, imageGeneration=${report.capabilities.imageGeneration ? "enabled" : "disabled"}`,
					"Harness defaults: unchanged by this plugin",
					...report.hints.map((hint) => `Hint: ${hint}`),
					""
				].join("\n"));
				return doctorExitCode(report);
			}
			case "migrate-history": {
				const result = await migrateOpenAICodexSearchHistory({
					apply: migrationApply,
					...migrationConfirmStopped ? { confirmStopped: true } : {},
					...migrationRoot === void 0 ? {} : { root: migrationRoot }
				});
				if (jsonOutput) printJson({
					schemaVersion: JSON_SCHEMA_VERSION,
					...result
				});
				else {
					const verb = result.mode === "apply" ? "Repaired" : "Found";
					process.stdout.write(`${verb} ${result.changedEvents} legacy Codex search event(s) in ${result.changedFiles} session file(s) under ${result.root}.\n`);
					if (result.mode === "dry-run" && result.changedEvents > 0) process.stdout.write("Stop DSH, then run again with --apply --confirm-stopped to create backups and repair these histories.\n");
				}
				return 0;
			}
			case "status": {
				const status = await openAICodexAuthStatus();
				if (jsonOutput) {
					printJson({
						schemaVersion: JSON_SCHEMA_VERSION,
						package: "dsh-codex-connect",
						version: CODEX_CONNECT_VERSION,
						status: status.authenticated ? "signed-in" : "signed-out"
					});
					return status.authenticated ? 0 : 1;
				}
				if (!status.authenticated) {
					process.stdout.write("Codex Connect: signed out\n");
					return 1;
				}
				const expires = status.expiresAt;
				const suffix = expires === void 0 || Number.isNaN(expires.valueOf()) ? "" : `; access token expires ${expires.toISOString()} (refresh is automatic)`;
				process.stdout.write(`Codex Connect: signed in${suffix}\n`);
				return 0;
			}
			case "trusted-origins": {
				const origins = await new OpenAICodexTrustedOriginsStore().list();
				if (jsonOutput) printJson({
					schemaVersion: JSON_SCHEMA_VERSION,
					origins
				});
				else for (const origin of origins) process.stdout.write(`${origin}\n`);
				return 0;
			}
			case "trust-origin": {
				if (originArgument === void 0) return 1;
				const normalized = normalizeTrustedOrigin(originArgument);
				const origins = await new OpenAICodexTrustedOriginsStore().trust(originArgument);
				process.stdout.write(`Trusted browser origin: ${normalized}\n`);
				process.stdout.write(`Trusted origins: ${origins.join(", ") || "(none)"}\n`);
				return 0;
			}
			case "untrust-origin": {
				if (originArgument === void 0) return 1;
				const normalized = normalizeTrustedOrigin(originArgument);
				const origins = await new OpenAICodexTrustedOriginsStore().untrust(originArgument);
				process.stdout.write(`Untrusted browser origin: ${normalized}\n`);
				process.stdout.write(`Trusted origins: ${origins.join(", ") || "(none)"}\n`);
				return 0;
			}
			case "logout":
				await logoutOpenAICodex();
				process.stdout.write(`Codex Connect: signed out; removed ${openAICodexAuthPath()}\n`);
				return 0;
			case "login": {
				const readline = createInterface({
					input: process.stdin,
					output: process.stdout
				});
				try {
					await loginOpenAICodex({
						prompt: (prompt) => answerPrompt(prompt, deviceCode, (text, options) => readline.question(text, options)),
						notify: (event) => notify(event, true)
					});
				} finally {
					readline.close();
				}
				process.stdout.write(`Codex Connect: signed in; credentials saved to ${openAICodexAuthPath()}\n`);
				return 0;
			}
		}
	} catch (error) {
		process.stderr.write(`dsh-codex-connect: ${action} failed: ${publicAuthError(error)}\n`);
		return 1;
	}
}
if (process.argv[1] !== void 0 && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = await run(process.argv.slice(2));
//#endregion
export { run };
