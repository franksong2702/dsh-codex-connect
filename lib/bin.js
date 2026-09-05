#!/usr/bin/env node
import { Bt as OPENAI_CODEX_PROVIDER, Dt as OpenAICodexTrustedOriginsStore, Ft as openAICodexModelCatalog, H as DSH_PLUGIN_API_PACKAGES, Ht as openAICodexAuthPath, Mt as loginOpenAICodex, N as CODEX_CONNECT_VERSION, Nt as logoutOpenAICodex, Ot as normalizeTrustedOrigin, Pt as openAICodexAuthStatus, Vt as OpenAICodexCredentialStore, X as readInstalledPackageVersion, Y as evaluateCompatibility, bt as ProxyAgent, c as migrateOpenAICodexSearchHistory, d as OPENAI_CODEX_BASE_URL, gt as normalizeOpenAICodexProxyUrl, j as diagnoseOpenAICodex, l as CODEX_AUTO_REVIEW_MODEL, u as probeCodexAutoReview, xt as fetch, yt as Agent } from "./src-BcyhDCEJ.js";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
//#region src/capability-probe.ts
/** A security limit, not a model output-token setting. */
const MAX_PROBE_RESPONSE_BYTES = 65536;
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function completedResponse(value, model) {
	if (!record(value) || value["status"] !== "completed" || !Array.isArray(value["output"])) return false;
	if (value["model"] !== model) return false;
	return value["output"].some((item) => record(item) && item["type"] === "message" && item["role"] === "assistant" && Array.isArray(item["content"]) && item["content"].some((part) => record(part) && part["type"] === "output_text" && typeof part["text"] === "string" && part["text"].trim().length > 0));
}
/** Inspect complete SSE frames, not substrings inside error text or schema errors. */
function completedStream(text, model) {
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
		if (!record(event)) return false;
		if (event["type"] === "error" || event["type"] === "response.failed" || event["type"] === "response.incomplete") return false;
		if (event["type"] === "response.completed" || event["type"] === "response.done") {
			if (completed || !completedResponse(event["response"], model)) return false;
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
		const response = await fetch(`${OPENAI_CODEX_BASE_URL}/responses`, {
			dispatcher,
			method: "POST",
			redirect: "manual",
			signal: controller.signal,
			headers: {
				authorization: `Bearer ${request.access}`,
				"chatgpt-account-id": request.accountId,
				"content-type": "application/json",
				accept: "text/event-stream",
				originator: "deepseek-harness"
			},
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
			outcome: completedStream(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)), request.model) ? "completed" : "incomplete",
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
		const runtime = DSH_PLUGIN_API_PACKAGES.some((name) => versions[name] !== null && versions[name] !== "0.1.2-rc.1") || compatibility.status === "incompatible" ? result("rejected", "declared-version-mismatch", "Use DSH API 0.1.2-rc.1 and pi-ai ^0.84.2 together. DSH 0.1.0-rc.7 requires Codex Connect 0.1.0-alpha.4.14.") : missing || compatibility.status === "unknown" ? result("unknown", "version-metadata-unavailable", "Run this command from the plugin installation in the intended profile.") : result("supported", "declared-host-versions-match", "Host package versions satisfy the declared requirements; this is not a live profile or browser compatibility test.");
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
		"       dsh-codex-connect migrate-history [--apply --confirm-stopped] [--root <path>] [--json]",
		"       dsh-codex-connect trust-origin <origin>",
		"       dsh-codex-connect trusted-origins [--json]",
		"       dsh-codex-connect untrust-origin <origin>",
		"       dsh-codex-connect capabilities [--model <catalog-id>] [--probe] [--proxy <http(s)-origin>] [--timeout-ms <1..60000>] [--json]",
		"       dsh-codex-connect auto-review-probe [--proxy <http(s)-origin>] [--timeout-ms <1..60000>] [--json]",
		"",
		"  doctor         inspect secret-free runtime and OAuth file metadata",
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
	let migrationApply = false;
	let migrationConfirmStopped = false;
	const unknown = [];
	if (action === "migrate-history") for (let index = 0; index < optionFlags.length; index += 1) {
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
		process.stderr.write(`dsh-codex-connect: ${action} failed: ${safeMessage(error)}\n`);
		return 1;
	}
}
if (process.argv[1] !== void 0 && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exitCode = await run(process.argv.slice(2));
//#endregion
export { run };
