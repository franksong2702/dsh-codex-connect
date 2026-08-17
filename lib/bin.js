#!/usr/bin/env node
import { E as CODEX_CONNECT_VERSION, G as openAICodexAuthStatus, R as OpenAICodexTrustedOriginsStore, U as loginOpenAICodex, W as logoutOpenAICodex, Y as openAICodexAuthPath, w as diagnoseOpenAICodex, z as normalizeTrustedOrigin } from "./src-Bi5Pc_6T.js";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
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
/** Remove token-like strings from an external OAuth diagnostic. */
function safeMessage(error) {
	return (error instanceof Error ? error.message : String(error)).replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu, "[redacted token]").replace(/(\b(?:code|token|refresh_token|access_token)=)[^&\s]+/giu, "$1[redacted]");
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
		"       dsh-codex-connect trust-origin <origin>",
		"       dsh-codex-connect trusted-origins [--json]",
		"       dsh-codex-connect untrust-origin <origin>",
		"",
		"  doctor         inspect secret-free runtime and OAuth file metadata",
		"  login          sign in with a separate ChatGPT OAuth session",
		"  logout         remove the dsh credential without changing ~/.codex",
		"  status         report non-secret dsh credential state",
		"  trust-origin   allow one exact browser origin to reach Web OAuth routes",
		"  trusted-origins list the currently allowed browser origins",
		"  untrust-origin remove one exact browser origin from the allowlist",
		"  --device-code  use headless device-code login (login only)",
		"  --json         emit one secret-free JSON document (doctor/status/trusted-origins only)",
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
	if (![
		"doctor",
		"login",
		"logout",
		"status",
		"trust-origin",
		"trusted-origins",
		"untrust-origin"
	].includes(rawAction)) {
		process.stderr.write(`dsh-codex-connect: expected doctor, login, logout, status, trust-origin, trusted-origins, or untrust-origin; got ${JSON.stringify(rawAction)}\n`);
		return 1;
	}
	const action = rawAction;
	const originArgument = action === "trust-origin" || action === "untrust-origin" ? flags[0] : void 0;
	const optionFlags = action === "trust-origin" || action === "untrust-origin" ? flags.slice(1) : flags;
	const deviceCode = optionFlags.includes("--device-code");
	const jsonOutput = optionFlags.includes("--json");
	if (optionFlags.filter((flag) => flag !== "--device-code" && flag !== "--json").length > 0 || deviceCode && action !== "login" || jsonOutput && (action === "login" || action === "logout" || deviceCode) || (action === "trust-origin" || action === "untrust-origin") && (originArgument === void 0 || optionFlags.length !== 0)) {
		process.stderr.write(`dsh-codex-connect: invalid options for ${action}: ${flags.join(" ")}\n`);
		return 1;
	}
	try {
		switch (action) {
			case "doctor": {
				const report = await diagnoseOpenAICodex();
				if (jsonOutput) {
					printJson(doctorJson(report));
					return doctorExitCode(report);
				}
				process.stdout.write([
					`Codex Connect ${report.version} on ${report.node}`,
					`OAuth file metadata: ${report.credentialFile.state} (${report.credentialFile.path})`,
					...report.compatibility === void 0 ? [] : [`Compatibility: ${report.compatibility.status} (Node ${report.compatibility.node.installed ?? "unknown"}; DSH API ${report.compatibility.packages["@deepseek-ai/dsh-llm"].installed ?? "unknown"}; pi-ai ${report.compatibility.packages["@earendil-works/pi-ai"].installed ?? "unknown"})`],
					`Optional capability defaults: search=${report.capabilities.search ? "enabled" : "disabled"}, imageTool=${report.capabilities.imageTool ? "enabled" : "disabled"}`,
					"Harness defaults: unchanged by this plugin",
					...report.hints.map((hint) => `Hint: ${hint}`),
					""
				].join("\n"));
				return doctorExitCode(report);
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
		process.stderr.write(`dsh-codex-connect: ${action} failed: ${safeMessage(error)}\n`);
		return 1;
	}
}
if (process.argv[1] !== void 0 && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = await run(process.argv.slice(2));
//#endregion
export { run };
