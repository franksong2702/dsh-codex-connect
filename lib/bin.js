#!/usr/bin/env node
import { A as logoutOpenAICodex, F as openAICodexAuthPath, j as openAICodexAuthStatus, k as loginOpenAICodex, w as diagnoseOpenAICodex } from "./src-k439bIuH.js";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
//#region src/bin.ts
/** Standalone credential CLI for the optional OpenAI Codex bundle. */
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
		"Usage: dsh-codex-connect <doctor|login|logout|status> [--device-code]",
		"",
		"  doctor         inspect secret-free runtime and OAuth file metadata",
		"  login          sign in with a separate ChatGPT OAuth session",
		"  logout         remove the dsh credential without changing ~/.codex",
		"  status         report non-secret dsh credential state",
		"  --device-code  use headless device-code login (login only)",
		""
	].join("\n"));
}
/** Execute one boot-free credential command. */
async function run(argv) {
	if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h") {
		printHelp();
		return 0;
	}
	const [rawAction, ...flags] = argv;
	if (rawAction !== "doctor" && rawAction !== "login" && rawAction !== "logout" && rawAction !== "status") {
		process.stderr.write(`dsh-codex-connect: expected doctor, login, logout, or status; got ${JSON.stringify(rawAction)}\n`);
		return 1;
	}
	const action = rawAction;
	if (flags.filter((flag) => flag !== "--device-code").length > 0 || flags.includes("--device-code") && action !== "login") {
		process.stderr.write(`dsh-codex-connect: invalid options for ${action}: ${flags.join(" ")}\n`);
		return 1;
	}
	try {
		switch (action) {
			case "doctor": {
				const report = await diagnoseOpenAICodex();
				process.stdout.write([
					`Codex Connect ${report.version} on ${report.node}`,
					`OAuth file metadata: ${report.credentialFile.state} (${report.credentialFile.path})`,
					`Optional capability defaults: search=${report.capabilities.search ? "enabled" : "disabled"}, imageTool=${report.capabilities.imageTool ? "enabled" : "disabled"}`,
					"Harness defaults: unchanged by this plugin",
					...report.hints.map((hint) => `Hint: ${hint}`),
					""
				].join("\n"));
				return report.credentialFile.state === "permissions-too-broad" || report.credentialFile.state === "not-a-regular-file" || report.credentialFile.state === "unreadable-metadata" ? 1 : 0;
			}
			case "status": {
				const status = await openAICodexAuthStatus();
				if (!status.authenticated) {
					process.stdout.write("Codex Connect: signed out\n");
					return 1;
				}
				const expires = status.expiresAt;
				const suffix = expires === void 0 || Number.isNaN(expires.valueOf()) ? "" : `; access token expires ${expires.toISOString()} (refresh is automatic)`;
				process.stdout.write(`Codex Connect: signed in${suffix}\n`);
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
						prompt: (prompt) => answerPrompt(prompt, flags.includes("--device-code"), (text, options) => readline.question(text, options)),
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
