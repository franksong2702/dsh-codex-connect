window.__ModuleLoader__.load({
	id: "dsh-codex-connect",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/settings-contract.ts
		/** Node-free settings contract shared by the Host plugin and browser card. */
		/** Stable Harness settings namespace owned by this plugin. */
		const OPENAI_CODEX_SETTINGS_NAMESPACE = "llm-openai-codex";
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
		/** Whether a value is a supported, canonical HTTP(S) proxy origin. */
		function isValidOpenAICodexProxyUrl(value) {
			return normalizeOpenAICodexProxyUrl(value) !== void 0;
		}
		/**
		* Whether a value is a bounded per-model context-window override map. Keys
		* are nonempty, unpadded model ids; values are positive safe integers or null
		* to restore that model's catalog default. The Host also checks catalog
		* membership and the model-specific configuration ceiling.
		*/
		function isValidOpenAICodexContextWindowOverrides(value) {
			if (!isRecord$3(value)) return false;
			const entries = Object.entries(value);
			if (entries.length > 256) return false;
			return entries.every(([modelId, window]) => modelId.length > 0 && modelId.trim() === modelId && (window === null || typeof window === "number" && Number.isSafeInteger(window) && window > 0));
		}
		/** Preserve per-model null masks until the Host has merged its settings layers. */
		function parseOpenAICodexContextWindowOverrides(value) {
			if (value === void 0 || value === null) return void 0;
			if (!isValidOpenAICodexContextWindowOverrides(value)) throw new TypeError("OpenAI Codex contextWindowOverrides must contain at most 256 nonempty model ids with positive safe-integer token budgets or null resets");
			return { ...value };
		}
		/** Resolve merged settings; whole-map or per-model null masks use catalog defaults. */
		function resolveOpenAICodexContextWindowOverrides(value) {
			const overrides = parseOpenAICodexContextWindowOverrides(value);
			if (overrides === void 0) return void 0;
			return Object.fromEntries(Object.entries(overrides).filter((entry) => entry[1] !== null));
		}
		Object.freeze({
			models: void 0,
			enableProxy: false,
			proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
			contextWindowOverrides: void 0,
			enableSearch: false,
			enableImageTool: false,
			enableImageGeneration: false,
			autoReviewDisclosureAcknowledged: false,
			enableAutoReview: false,
			searchModel: "gpt-5.6-sol",
			searchMode: "cached",
			searchContextSize: "medium",
			searchMaxOutputTokens: 1e4
		});
		function isRecord$3(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/** Narrow the redacted settings wire payload before it enters React state. */
		function decodeOpenAICodexSettings(value) {
			if (!isRecord$3(value)) return void 0;
			const models = value["models"];
			const enableProxy = value["enableProxy"];
			const proxyUrl = value["proxyUrl"];
			const contextWindowOverrides = value["contextWindowOverrides"];
			const enableSearch = value["enableSearch"];
			const enableImageTool = value["enableImageTool"];
			const enableImageGeneration = value["enableImageGeneration"];
			const autoReviewDisclosureAcknowledged = value["autoReviewDisclosureAcknowledged"];
			const enableAutoReview = value["enableAutoReview"];
			const searchModel = value["searchModel"];
			const searchMode = value["searchMode"];
			const searchContextSize = value["searchContextSize"];
			const searchMaxOutputTokens = value["searchMaxOutputTokens"];
			if (models !== void 0 && (!Array.isArray(models) || models.some((model) => typeof model !== "string"))) return void 0;
			if (enableProxy !== void 0 && typeof enableProxy !== "boolean") return void 0;
			if (proxyUrl !== void 0 && (typeof proxyUrl !== "string" || !isValidOpenAICodexProxyUrl(proxyUrl))) return void 0;
			if (contextWindowOverrides !== void 0 && contextWindowOverrides !== null && !isValidOpenAICodexContextWindowOverrides(contextWindowOverrides)) return void 0;
			if (typeof enableSearch !== "boolean" || typeof enableImageTool !== "boolean") return void 0;
			if (enableImageGeneration !== void 0 && typeof enableImageGeneration !== "boolean") return void 0;
			if (autoReviewDisclosureAcknowledged !== void 0 && typeof autoReviewDisclosureAcknowledged !== "boolean") return void 0;
			if (enableAutoReview !== void 0 && typeof enableAutoReview !== "boolean") return void 0;
			if (typeof searchModel !== "string" || searchModel.trim().length === 0) return void 0;
			if (searchMode !== "cached" && searchMode !== "indexed" && searchMode !== "live") return void 0;
			if (searchContextSize !== "low" && searchContextSize !== "medium" && searchContextSize !== "high") return void 0;
			if (typeof searchMaxOutputTokens !== "number" || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return void 0;
			const overrides = resolveOpenAICodexContextWindowOverrides(contextWindowOverrides);
			return {
				models: models === void 0 ? void 0 : [...new Set(models)],
				enableProxy: enableProxy ?? false,
				proxyUrl: proxyUrl === void 0 ? DEFAULT_OPENAI_CODEX_PROXY_URL : normalizeOpenAICodexProxyUrl(proxyUrl),
				contextWindowOverrides: overrides === void 0 ? void 0 : Object.freeze(overrides),
				enableSearch,
				enableImageTool,
				enableImageGeneration: enableImageGeneration ?? false,
				autoReviewDisclosureAcknowledged: autoReviewDisclosureAcknowledged ?? false,
				enableAutoReview: enableAutoReview ?? false,
				searchModel,
				searchMode,
				searchContextSize,
				searchMaxOutputTokens
			};
		}
		//#endregion
		//#region src/auth-paths.ts
		/** Node-free route constants shared by the Host and browser plugin halves. */
		/** Plugin-owned status endpoint consumed by its browser half. */
		const OPENAI_CODEX_AUTH_STATUS_PATH = "/plugins/dsh-openai-codex/auth/status";
		/** Plugin-owned browser-login endpoint consumed by its browser half. */
		const OPENAI_CODEX_AUTH_LOGIN_PATH = "/plugins/dsh-openai-codex/auth/login";
		/** Plugin-owned logout endpoint consumed by its browser half. */
		const OPENAI_CODEX_AUTH_LOGOUT_PATH = "/plugins/dsh-openai-codex/auth/logout";
		/** Cancel only the pending authorization; never delete a stored credential. */
		const OPENAI_CODEX_AUTH_CANCEL_PATH = "/plugins/dsh-openai-codex/auth/cancel";
		/** List, activate, and remove stored OpenAI Codex accounts. */
		const OPENAI_CODEX_AUTH_ACCOUNTS_PATH = "/plugins/dsh-openai-codex/auth/accounts";
		//#endregion
		//#region src/client/account-store.ts
		var AccountRequestError = class extends Error {};
		function isRecord$2(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function parseUsage(value) {
			if (!isRecord$2(value) || !Array.isArray(value["rateLimits"])) throw new AccountRequestError("Invalid account response");
			const rateLimits = value["rateLimits"].map((candidate) => {
				if (!isRecord$2(candidate) || typeof candidate["id"] !== "string" || candidate["id"].length === 0 || candidate["id"].length > 128 || candidate["name"] !== void 0 && (typeof candidate["name"] !== "string" || candidate["name"].length > 128) || !Array.isArray(candidate["windows"])) throw new AccountRequestError("Invalid account response");
				const windows = candidate["windows"].map((window) => {
					if (!isRecord$2(window) || typeof window["remainingPercent"] !== "number" || !Number.isFinite(window["remainingPercent"]) || window["remainingPercent"] < 0 || window["remainingPercent"] > 100 || typeof window["windowSeconds"] !== "number" || !Number.isSafeInteger(window["windowSeconds"]) || window["windowSeconds"] <= 0 || window["resetAt"] !== void 0 && (typeof window["resetAt"] !== "number" || !Number.isSafeInteger(window["resetAt"]) || window["resetAt"] <= 0)) throw new AccountRequestError("Invalid account response");
					return {
						remainingPercent: window["remainingPercent"],
						windowSeconds: window["windowSeconds"],
						...typeof window["resetAt"] === "number" ? { resetAt: window["resetAt"] } : {}
					};
				});
				return {
					id: candidate["id"],
					...typeof candidate["name"] === "string" ? { name: candidate["name"] } : {},
					windows
				};
			});
			const credits = value["credits"];
			if (credits !== void 0 && (!isRecord$2(credits) || typeof credits["unlimited"] !== "boolean" || credits["balance"] !== void 0 && typeof credits["balance"] !== "string")) throw new AccountRequestError("Invalid account response");
			const individual = value["individualLimit"];
			if (individual !== void 0 && (!isRecord$2(individual) || typeof individual["limit"] !== "string" || typeof individual["used"] !== "string" || typeof individual["remaining"] !== "string" || typeof individual["remainingPercent"] !== "number" || !Number.isFinite(individual["remainingPercent"]) || individual["remainingPercent"] < 0 || individual["remainingPercent"] > 100)) throw new AccountRequestError("Invalid account response");
			return {
				rateLimits,
				...isRecord$2(credits) ? { credits: {
					unlimited: credits["unlimited"],
					...typeof credits["balance"] === "string" ? { balance: credits["balance"] } : {}
				} } : {},
				...isRecord$2(individual) ? { individualLimit: {
					limit: individual["limit"],
					used: individual["used"],
					remaining: individual["remaining"],
					remainingPercent: individual["remainingPercent"]
				} } : {}
			};
		}
		function parseStatus(value) {
			if (!isRecord$2(value) || typeof value["status"] !== "string") throw new AccountRequestError("Invalid account response");
			if (value["status"] === "signed-out" || value["status"] === "signing-in") return { status: value["status"] };
			if (value["status"] === "signed-in") {
				if (value["quotaError"] !== void 0 && typeof value["quotaError"] !== "string") throw new AccountRequestError("Invalid account response");
				return {
					status: "signed-in",
					usage: parseUsage(value["usage"]),
					...typeof value["quotaError"] === "string" ? { quotaError: value["quotaError"] } : {}
				};
			}
			if (value["status"] === "reauth-required" || value["status"] === "error") {
				if (typeof value["message"] !== "string") throw new AccountRequestError("Invalid account response");
				return {
					status: value["status"],
					message: value["message"]
				};
			}
			throw new AccountRequestError("Invalid account response");
		}
		function parseAccounts(value) {
			if (!isRecord$2(value) || !Array.isArray(value["accounts"])) throw new AccountRequestError("Invalid account response");
			if (value["accounts"].length > 16) throw new AccountRequestError("Invalid account response");
			const accounts = value["accounts"].map((candidate) => {
				if (!isRecord$2(candidate) || typeof candidate["accountKey"] !== "string" || !/^acct_[A-Za-z0-9_-]{43}$/u.test(candidate["accountKey"]) || typeof candidate["active"] !== "boolean" || typeof candidate["displayName"] !== "string" || candidate["displayName"].length === 0 || candidate["displayName"].length > 128 || candidate["maskedEmail"] !== void 0 && typeof candidate["maskedEmail"] !== "string" || typeof candidate["maskedEmail"] === "string" && candidate["maskedEmail"].length > 320 || candidate["profileSource"] !== "oauth" && candidate["profileSource"] !== "generated") throw new AccountRequestError("Invalid account response");
				return {
					accountKey: candidate["accountKey"],
					active: candidate["active"],
					displayName: candidate["displayName"],
					...typeof candidate["maskedEmail"] === "string" ? { maskedEmail: candidate["maskedEmail"] } : {},
					profileSource: candidate["profileSource"]
				};
			});
			if (new Set(accounts.map((account) => account.accountKey)).size !== accounts.length || accounts.filter((account) => account.active).length !== (accounts.length === 0 ? 0 : 1)) throw new AccountRequestError("Invalid account response");
			return accounts;
		}
		function parseChallenge(value) {
			if (!isRecord$2(value) || typeof value["url"] !== "string") throw new AccountRequestError("Invalid account response");
			let url;
			try {
				url = new URL(value["url"]);
			} catch {
				throw new AccountRequestError("Invalid account response");
			}
			if (url.protocol !== "https:" || url.username !== "" || url.password !== "") throw new AccountRequestError("Invalid account response");
			return { url: url.href };
		}
		async function request(path, method = "GET", signal, body) {
			const response = await fetch(path, {
				method,
				headers: {
					accept: "application/json",
					...body === void 0 ? {} : { "content-type": "application/json" }
				},
				credentials: "same-origin",
				...signal === void 0 ? {} : { signal },
				...body === void 0 ? {} : { body: JSON.stringify(body) }
			});
			const value = await response.json().catch(() => void 0);
			if (!response.ok) throw new AccountRequestError(typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : `HTTP ${response.status}`);
			return value;
		}
		/** One account state per browser-plugin instance; subscribers share requests and timers. */
		var OpenAICodexAccountStore = class {
			snapshot = {
				status: { status: "loading" },
				busy: false,
				accounts: [],
				operation: { kind: "idle" }
			};
			listeners = /* @__PURE__ */ new Set();
			controller;
			timer;
			disposed = false;
			popup = null;
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				if (this.disposed) return () => {};
				this.listeners.add(listener);
				if (this.listeners.size === 1) this.refresh();
				return () => {
					this.listeners.delete(listener);
					if (this.listeners.size === 0) this.stopPolling();
				};
			};
			publish(snapshot) {
				if (this.disposed) return;
				this.snapshot = snapshot;
				for (const listener of this.listeners) listener();
			}
			failure(error) {
				return error instanceof AccountRequestError && error.message === "remote-web-origin-not-trusted" ? { status: "remote-web-origin-not-trusted" } : {
					status: "error",
					message: error instanceof Error ? error.message : "Account request failed"
				};
			}
			errorMessage(error) {
				return error instanceof Error ? error.message : "Account request failed";
			}
			stopPolling() {
				clearTimeout(this.timer);
				this.timer = void 0;
				this.controller?.abort();
				this.controller = void 0;
			}
			schedule() {
				clearTimeout(this.timer);
				const interval = this.snapshot.operation.kind === "waiting-authorization" || this.snapshot.status.status === "signing-in" ? 1e3 : this.snapshot.operationError !== void 0 && this.snapshot.accounts.length > 0 ? 5e3 : this.snapshot.status.status === "signed-in" ? 6e4 : this.snapshot.status.status === "error" && this.snapshot.accounts.length > 0 ? 5e3 : void 0;
				if (!this.disposed && this.listeners.size > 0 && interval !== void 0) this.timer = setTimeout(() => {
					this.refresh();
				}, interval);
			}
			async readServerState(signal) {
				const response = await request(OPENAI_CODEX_AUTH_STATUS_PATH, "GET", signal);
				return {
					status: parseStatus(response),
					accounts: parseAccounts(response)
				};
			}
			stableStatus(status, accounts) {
				if (status.status !== "signing-in" || accounts.length === 0) return status;
				return this.snapshot.status.status === "signed-in" || this.snapshot.status.status === "reauth-required" ? this.snapshot.status : status;
			}
			/** Refresh only while observed, without overlapping status reads or OAuth mutations. */
			async refresh() {
				if (this.disposed || this.snapshot.busy || this.controller !== void 0 || this.listeners.size === 0) return;
				const controller = new AbortController();
				this.controller = controller;
				try {
					const server = await this.readServerState(controller.signal);
					if (!controller.signal.aborted) this.publish({
						status: this.stableStatus(server.status, server.accounts),
						accounts: server.accounts,
						busy: false,
						operation: server.status.status === "signing-in" ? { kind: "waiting-authorization" } : { kind: "idle" },
						...server.status.status === "signing-in" && this.snapshot.loginUrl !== void 0 ? { loginUrl: this.snapshot.loginUrl } : {}
					});
				} catch (error) {
					if (!controller.signal.aborted) this.publish({
						status: this.failure(error),
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "idle" }
					});
				} finally {
					if (this.controller === controller) {
						this.controller = void 0;
						this.schedule();
					}
				}
			}
			/** Start or reopen the server-owned authorization from a user click, retaining popup permission. */
			async signIn() {
				if (this.disposed || this.snapshot.busy) return;
				this.stopPolling();
				const popup = window.open("about:blank", "_blank");
				this.popup = popup;
				if (popup !== null) popup.opener = null;
				const retained = this.snapshot.status.status === "signed-in" || this.snapshot.status.status === "reauth-required" ? this.snapshot.status : { status: "signing-in" };
				this.publish({
					status: retained,
					busy: true,
					accounts: this.snapshot.accounts,
					operation: { kind: "starting-authorization" }
				});
				try {
					const challenge = parseChallenge(await request(OPENAI_CODEX_AUTH_LOGIN_PATH, "POST"));
					if (this.disposed) {
						popup?.close();
						return;
					}
					if (popup !== null) popup.location.replace(challenge.url);
					this.publish({
						status: retained,
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "waiting-authorization" },
						loginUrl: challenge.url
					});
				} catch (error) {
					popup?.close();
					this.publish(this.snapshot.accounts.length === 0 ? {
						status: this.failure(error),
						busy: false,
						accounts: [],
						operation: { kind: "idle" }
					} : {
						status: retained,
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "idle" },
						operationError: this.errorMessage(error)
					});
					if (error instanceof AccountRequestError && error.message === "OpenAI Codex sign-in cancelled") await this.refresh();
				} finally {
					if (this.popup === popup) this.popup = null;
					this.schedule();
				}
			}
			/** Cancel only the pending authorization, preserving an already signed-in account. */
			async cancel() {
				if (this.disposed || this.snapshot.busy) return;
				this.stopPolling();
				this.publish({
					...this.snapshot,
					busy: true,
					operation: { kind: "cancelling-authorization" }
				});
				try {
					const status = parseStatus(await request(OPENAI_CODEX_AUTH_CANCEL_PATH, "POST"));
					this.publish({
						status,
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "idle" }
					});
				} catch (error) {
					this.publish(this.snapshot.accounts.length === 0 ? {
						status: this.failure(error),
						busy: false,
						accounts: [],
						operation: { kind: "idle" }
					} : {
						status: this.snapshot.status,
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "idle" },
						operationError: this.errorMessage(error)
					});
				} finally {
					this.schedule();
				}
			}
			/** Sign out once for all mounted account views and invalidate older status reads. */
			async signOut() {
				if (this.disposed || this.snapshot.busy) return;
				this.stopPolling();
				this.publish({
					...this.snapshot,
					busy: true,
					operation: { kind: "signing-out" }
				});
				try {
					await request(OPENAI_CODEX_AUTH_LOGOUT_PATH, "POST");
					this.publish({
						status: { status: "signed-out" },
						busy: false,
						accounts: [],
						operation: { kind: "idle" }
					});
				} catch (error) {
					this.publish({
						status: this.snapshot.status,
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "idle" },
						operationError: this.errorMessage(error)
					});
				}
			}
			/** Select one stored account and refresh account-specific status and quota. */
			async activate(accountKey) {
				if (this.disposed || this.snapshot.busy || this.snapshot.accounts.some((account) => account.accountKey === accountKey && account.active)) return;
				await this.mutateAccount("activating", accountKey, "POST", { accountKey });
			}
			/** Remove one stored account, naming the replacement when the active account is removed. */
			async remove(accountKey, replacementAccountKey) {
				if (this.disposed || this.snapshot.busy) return;
				await this.mutateAccount("removing", accountKey, "DELETE", {
					accountKey,
					...replacementAccountKey === void 0 ? {} : { replacementAccountKey }
				});
			}
			async mutateAccount(kind, accountKey, method, body) {
				this.stopPolling();
				this.publish({
					...this.snapshot,
					busy: true,
					operation: {
						kind,
						accountKey
					}
				});
				try {
					const status = parseStatus(await request(OPENAI_CODEX_AUTH_ACCOUNTS_PATH, method, void 0, body));
					const accounts = parseAccounts(await request(OPENAI_CODEX_AUTH_ACCOUNTS_PATH));
					this.publish({
						status,
						accounts,
						busy: false,
						operation: { kind: "idle" }
					});
				} catch (error) {
					this.publish({
						status: this.snapshot.status,
						accounts: this.snapshot.accounts,
						busy: false,
						operation: { kind: "idle" },
						operationError: this.errorMessage(error)
					});
				} finally {
					this.schedule();
				}
			}
			/** Stop local observation on plugin unload; do not log out the server account. */
			dispose() {
				this.disposed = true;
				this.stopPolling();
				this.popup?.close();
				this.popup = null;
				this.listeners.clear();
				this.snapshot = {
					status: { status: "loading" },
					busy: false,
					accounts: [],
					operation: { kind: "idle" }
				};
			}
		};
		//#endregion
		//#region src/model-contract.ts
		/** Node-free model catalog contract shared by the Host route and browser card. */
		/** Same-origin endpoint exposing the complete Codex model catalog. */
		const OPENAI_CODEX_MODEL_CATALOG_PATH = "/plugins/dsh-codex-connect/models";
		/** Versioned official-client override policy, not a measured endpoint capacity. */
		const OPENAI_CODEX_CONTEXT_LIMIT_SOURCE = "https://github.com/openai/codex/blob/a97cf1b72eaad05aa49847bc81d09ceac9327754/codex-rs/models-manager/models.json";
		Object.freeze({
			"gpt-6-astra": 872e3,
			"gpt-5.6-sol": 872e3,
			"gpt-5.6-terra": 872e3,
			"gpt-5.6-luna": 872e3,
			"gpt-5.4": 1e6,
			"gpt-5.5": 272e3,
			"gpt-5.4-mini": 272e3
		});
		/** Whether a proposed local token budget fits the model's configuration range. */
		function isValidOpenAICodexContextBudget(value, maximum) {
			return Number.isSafeInteger(value) && value > 0 && value <= maximum;
		}
		/** Validate the model catalog before it enters React state. */
		function decodeOpenAICodexModelCatalog(value) {
			if (!Array.isArray(value)) return void 0;
			const catalog = [];
			const ids = /* @__PURE__ */ new Set();
			for (const entry of value) {
				if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return void 0;
				const record = entry;
				const id = record["id"];
				const name = record["name"];
				const contextWindow = record["contextWindow"];
				const maxContextWindow = record["maxContextWindow"];
				const contextLimitSource = record["contextLimitSource"];
				if (typeof id !== "string" || id.length === 0 || typeof name !== "string" || name.length === 0 || ids.has(id)) return void 0;
				if (typeof contextWindow !== "number" || typeof maxContextWindow !== "number" || !isValidOpenAICodexContextBudget(maxContextWindow, Number.MAX_SAFE_INTEGER) || !isValidOpenAICodexContextBudget(contextWindow, maxContextWindow) || contextLimitSource !== "codex-catalog" && contextLimitSource !== "catalog-default") return void 0;
				ids.add(id);
				catalog.push({
					id,
					name,
					contextWindow,
					maxContextWindow,
					contextLimitSource
				});
			}
			return catalog;
		}
		//#endregion
		//#region src/proxy-paths.ts
		/** Node-free route constants shared by the Host and browser plugin halves. */
		/** Detect bounded local/environment proxy candidates without changing settings. */
		const OPENAI_CODEX_PROXY_DETECT_PATH = "/plugins/dsh-openai-codex/proxy/detect";
		/** Test one manually entered proxy origin without changing settings. */
		const OPENAI_CODEX_PROXY_TEST_PATH = "/plugins/dsh-openai-codex/proxy/test";
		//#endregion
		//#region src/client/OpenAICodexConfiguration.tsx
		/** Staged optional-capability editor inside the OpenAI Codex plugin card. */
		const sectionStyle$1 = {
			display: "flex",
			flexDirection: "column",
			gap: 14,
			paddingTop: 18,
			borderTop: "1px solid var(--dsw-alias-border-l2)"
		};
		const headingStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "20px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)"
		};
		const bodyStyle$2 = {
			margin: 0,
			fontSize: 13,
			lineHeight: "20px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const fieldsetStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 13,
			margin: 0,
			padding: 0,
			border: 0
		};
		const modelListStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 10
		};
		const modelRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 9,
			minHeight: 30,
			fontSize: 13,
			color: "var(--dsw-alias-label-primary)",
			cursor: "pointer"
		};
		const modelIdStyle = {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: 12,
			color: "var(--dsw-alias-label-secondary)"
		};
		const toggleRowStyle = {
			display: "flex",
			alignItems: "flex-start",
			gap: 10,
			cursor: "pointer"
		};
		const toggleCopyStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 2
		};
		const labelStyle = {
			fontSize: 13,
			lineHeight: "20px",
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)"
		};
		const formGridStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
			gap: 12
		};
		const formFieldStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 6
		};
		const controlStyle = {
			boxSizing: "border-box",
			width: "100%",
			minHeight: 36,
			padding: "7px 10px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: 13
		};
		const actionsStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 10
		};
		const buttonsStyle = {
			display: "flex",
			gap: 8
		};
		const buttonStyle$3 = {
			boxSizing: "border-box",
			minHeight: 34,
			padding: "6px 14px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 18,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: 13,
			cursor: "pointer"
		};
		const primaryButtonStyle$2 = {
			...buttonStyle$3,
			borderColor: "var(--dsw-alias-button-primary-fill)",
			background: "var(--dsw-alias-button-primary-fill)",
			color: "var(--dsw-alias-label-primary-foreground)"
		};
		const proxyButtonStyle = {
			...buttonStyle$3,
			minHeight: 44
		};
		const primaryProxyButtonStyle = {
			...primaryButtonStyle$2,
			minHeight: 44
		};
		const errorStyle$2 = {
			...bodyStyle$2,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const successStyle = {
			...bodyStyle$2,
			color: "var(--dsw-alias-state-success-primary, #16825d)"
		};
		const badgeStyle = {
			display: "inline-flex",
			alignItems: "center",
			minHeight: 18,
			padding: "0 6px",
			borderRadius: 999,
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))",
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 11,
			lineHeight: "18px",
			fontWeight: 500
		};
		const connectionCardStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 14,
			padding: "14px 16px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))"
		};
		const candidateStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 12,
			minHeight: 64,
			padding: "10px 12px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10
		};
		const statePillStyle = {
			...bodyStyle$2,
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			minHeight: 32,
			padding: "4px 10px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 999,
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))",
			whiteSpace: "nowrap"
		};
		const proxyTabsStyle = {
			display: "inline-flex",
			alignSelf: "flex-start",
			padding: 3,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))"
		};
		const proxyTabStyle = {
			boxSizing: "border-box",
			minHeight: 44,
			padding: "8px 14px",
			border: 0,
			borderRadius: 7,
			background: "transparent",
			color: "var(--dsw-alias-label-secondary)",
			font: "inherit",
			fontSize: 13,
			cursor: "pointer"
		};
		const activeProxyTabStyle = {
			...proxyTabStyle,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			boxShadow: "0 1px 3px rgb(0 0 0 / 8%)"
		};
		const pendingStyle = {
			...bodyStyle$2,
			padding: "9px 12px",
			borderRadius: 8,
			background: "var(--dsw-alias-state-warning-bg, #fff7df)",
			color: "var(--dsw-alias-state-warning-primary, #8a5a00)"
		};
		const moduleTabsStyle$1 = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
			gap: 8
		};
		const moduleTabStyle$1 = {
			...buttonStyle$3,
			minWidth: 0,
			minHeight: 44,
			borderRadius: 10,
			overflowWrap: "anywhere"
		};
		const activeModuleTabStyle$1 = {
			...moduleTabStyle$1,
			border: "1px solid var(--dsw-alias-button-primary-fill)",
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))",
			color: "var(--dsw-alias-label-primary)"
		};
		const CONFIGURATION_MODULES = [
			"models",
			"network",
			"capabilities"
		];
		const UNAVAILABLE_SNAPSHOT = {
			status: "unavailable",
			value: void 0,
			base: void 0,
			user: void 0,
			revision: void 0,
			writable: false,
			mode: "memory"
		};
		const CONFIG_FIELDS = [
			"models",
			"contextWindowOverrides",
			"enableProxy",
			"proxyUrl",
			"enableImageTool",
			"enableImageGeneration",
			"autoReviewDisclosureAcknowledged",
			"enableAutoReview",
			"searchModel",
			"searchMode",
			"searchContextSize",
			"searchMaxOutputTokens",
			"enableSearch"
		];
		/** Require one profile-scoped acknowledgement before staging Auto-review. */
		function AutoReviewConsentDialog({ t, onCancel, onConfirm }) {
			const dialog = (0, react.useRef)(null);
			const titleId = (0, react.useId)();
			(0, react.useEffect)(() => {
				const element = dialog.current;
				element?.showModal();
				return () => {
					element?.close();
				};
			}, []);
			const close = () => {
				dialog.current?.close();
				onCancel();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dialog", {
				ref: dialog,
				"aria-labelledby": titleId,
				onCancel: (event) => {
					event.preventDefault();
					close();
				},
				style: {
					boxSizing: "border-box",
					width: "min(560px, calc(100vw - 32px))",
					padding: 20,
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 12,
					background: "var(--dsw-alias-bg-layer-1, white)",
					color: "var(--dsw-alias-label-primary)",
					margin: "auto"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 12
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: titleId,
							style: {
								margin: 0,
								fontSize: 18
							},
							children: t("autoReviewConfirmTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: bodyStyle$2,
							children: t("autoReviewDisclosure")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: bodyStyle$2,
							children: t("autoReviewFailureDisclosure")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							href: "https://learn.chatgpt.com/docs/sandboxing/auto-review",
							target: "_blank",
							rel: "noopener noreferrer",
							style: {
								...bodyStyle$2,
								textDecoration: "underline",
								textUnderlineOffset: 3
							},
							children: t("autoReviewOfficialDocs")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								...buttonsStyle,
								justifyContent: "flex-end"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle$3,
								onClick: close,
								children: t("autoReviewCancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: primaryButtonStyle$2,
								onClick: () => {
									dialog.current?.close();
									onConfirm();
								},
								children: t("autoReviewConfirm")
							})]
						})
					]
				})
			});
		}
		function sameField(field, left, right) {
			if (field === "contextWindowOverrides") {
				const leftMap = left;
				const rightMap = right;
				return Object.keys(leftMap ?? {}).length === Object.keys(rightMap ?? {}).length && Object.entries(leftMap ?? {}).every(([id, value]) => rightMap?.[id] === value);
			}
			if (field !== "models") return left === right;
			if (left === void 0 || right === void 0) return left === right;
			return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((model, index) => model === right[index]);
		}
		function sameConfig(left, right) {
			return left !== void 0 && right !== void 0 && CONFIG_FIELDS.every((field) => sameField(field, left[field], right[field]));
		}
		/** Edit the Host-owned llm-openai-codex settings section with Save/Discard staging. */
		function OpenAICodexConfiguration({ scope, t, activeModule, panelIdPrefix }) {
			const subscribe = (0, react.useCallback)((listener) => scope?.subscribe(listener) ?? (() => void 0), [scope]);
			const getSnapshot = (0, react.useCallback)(() => scope?.getSnapshot() ?? UNAVAILABLE_SNAPSHOT, [scope]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
			const [draft, setDraft] = (0, react.useState)(snapshot.value);
			const [dirty, setDirty] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [feedback, setFeedback] = (0, react.useState)("idle");
			const [modelCatalog, setModelCatalog] = (0, react.useState)();
			const [modelCatalogError, setModelCatalogError] = (0, react.useState)(false);
			const [expandedModels, setExpandedModels] = (0, react.useState)({});
			const [proxyDetection, setProxyDetection] = (0, react.useState)({ status: "idle" });
			const [proxyMode, setProxyMode] = (0, react.useState)("auto");
			const [manualProxyUrl, setManualProxyUrl] = (0, react.useState)(snapshot.value?.proxyUrl ?? "");
			const [manualProbe, setManualProbe] = (0, react.useState)();
			const [manualProbeBusy, setManualProbeBusy] = (0, react.useState)(false);
			const [currentProxyCheck, setCurrentProxyCheck] = (0, react.useState)({ status: "idle" });
			const [autoReviewConfirmOpen, setAutoReviewConfirmOpen] = (0, react.useState)(false);
			const [localModule, setLocalModule] = (0, react.useState)("models");
			const localPanelIdPrefix = (0, react.useId)();
			const proxyDetectionRequest = (0, react.useRef)(0);
			const manualProbeRequest = (0, react.useRef)(0);
			const currentProxyCheckRequest = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				if (scope === void 0) return;
				const controller = new AbortController();
				fetch(OPENAI_CODEX_MODEL_CATALOG_PATH, {
					method: "GET",
					credentials: "same-origin",
					headers: { accept: "application/json" },
					signal: controller.signal
				}).then(async (response) => {
					if (!response.ok) throw new Error(`model catalog request failed: ${String(response.status)}`);
					const catalog = decodeOpenAICodexModelCatalog(await response.json());
					if (catalog === void 0) throw new Error("model catalog response was invalid");
					setModelCatalog(catalog);
					setModelCatalogError(false);
				}).catch(() => {
					if (!controller.signal.aborted) setModelCatalogError(true);
				});
				return () => {
					controller.abort();
				};
			}, [scope]);
			(0, react.useEffect)(() => {
				if (!dirty && !busy) {
					setDraft(snapshot.value);
					setManualProxyUrl(snapshot.value?.proxyUrl ?? "");
				}
			}, [
				busy,
				dirty,
				snapshot.revision,
				snapshot.value
			]);
			(0, react.useEffect)(() => {
				if (feedback !== "saved") return;
				const timer = window.setTimeout(() => {
					setFeedback("idle");
				}, 2500);
				return () => {
					window.clearTimeout(timer);
				};
			}, [feedback]);
			(0, react.useEffect)(() => () => {
				proxyDetectionRequest.current += 1;
				manualProbeRequest.current += 1;
				currentProxyCheckRequest.current += 1;
			}, []);
			const clearCurrentProxyCheck = () => {
				currentProxyCheckRequest.current += 1;
				setCurrentProxyCheck({ status: "idle" });
			};
			const update = (field, value) => {
				setDraft((current) => current === void 0 ? current : {
					...current,
					[field]: value
				});
				setDirty(true);
				setFeedback("idle");
			};
			const discard = () => {
				setDraft(scope?.getSnapshot().value);
				setDirty(false);
				setFeedback("idle");
				setProxyDetection({ status: "idle" });
				setProxyMode("auto");
				setManualProxyUrl(scope?.getSnapshot().value?.proxyUrl ?? "");
				manualProbeRequest.current += 1;
				setManualProbe(void 0);
				setManualProbeBusy(false);
				clearCurrentProxyCheck();
				setAutoReviewConfirmOpen(false);
			};
			const confirmAutoReview = () => {
				setDraft((current) => current === void 0 ? current : {
					...current,
					autoReviewDisclosureAcknowledged: true,
					enableAutoReview: true
				});
				setDirty(true);
				setFeedback("idle");
				setAutoReviewConfirmOpen(false);
			};
			const detectProxy = async () => {
				const request = ++proxyDetectionRequest.current;
				setProxyDetection({ status: "detecting" });
				try {
					const response = await fetch(OPENAI_CODEX_PROXY_DETECT_PATH, {
						method: "POST",
						credentials: "same-origin",
						headers: { accept: "application/json" }
					});
					if (!response.ok) throw new Error(`proxy detection failed: ${String(response.status)}`);
					const value = await response.json();
					if (!Array.isArray(value.candidates) || !Array.isArray(value.results)) throw new Error("proxy detection response was invalid");
					if (request !== proxyDetectionRequest.current) return;
					setProxyDetection(value.candidates.length > 0 ? {
						status: "candidate",
						candidates: value.candidates
					} : {
						status: "failed",
						results: value.results
					});
				} catch {
					if (request === proxyDetectionRequest.current) setProxyDetection({
						status: "failed",
						results: []
					});
				}
			};
			const useProxy = (proxyUrl) => {
				if (draft === void 0) return;
				const normalized = normalizeOpenAICodexProxyUrl(proxyUrl);
				if (normalized === void 0) return;
				const detected = proxyDetection.status === "candidate" ? proxyDetection.candidates.find((candidate) => candidate.reachable && candidate.proxyUrl === normalized) : void 0;
				const tested = manualProbe?.reachable === true && manualProbe.proxyUrl === normalized ? manualProbe : detected;
				if (tested === void 0) return;
				setDraft({
					...draft,
					proxyUrl: normalized,
					enableProxy: true
				});
				setManualProxyUrl(normalized);
				setDirty(true);
				setFeedback("idle");
				setManualProbe(tested);
				clearCurrentProxyCheck();
			};
			const testManualProxy = async () => {
				const normalized = normalizeOpenAICodexProxyUrl(manualProxyUrl);
				if (normalized === void 0) return;
				const request = ++manualProbeRequest.current;
				setManualProbeBusy(true);
				try {
					const path = `${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(normalized)}`;
					const response = await fetch(path, {
						method: "POST",
						credentials: "same-origin",
						headers: { accept: "application/json" }
					});
					if (!response.ok) throw new Error(`proxy test failed: ${String(response.status)}`);
					const result = await response.json();
					if (request === manualProbeRequest.current && normalizeOpenAICodexProxyUrl(manualProxyUrl) === normalized) setManualProbe(result);
				} catch {
					if (request === manualProbeRequest.current && normalizeOpenAICodexProxyUrl(manualProxyUrl) === normalized) setManualProbe({
						proxyUrl: normalized,
						reachable: false,
						classification: "connect-failure"
					});
				} finally {
					if (request === manualProbeRequest.current) setManualProbeBusy(false);
				}
			};
			const checkCurrentProxy = async () => {
				const saved = scope?.getSnapshot().value;
				const normalized = saved?.enableProxy === true ? normalizeOpenAICodexProxyUrl(saved.proxyUrl) : void 0;
				if (normalized === void 0) return;
				const request = ++currentProxyCheckRequest.current;
				setCurrentProxyCheck({ status: "checking" });
				try {
					const path = `${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(normalized)}`;
					const response = await fetch(path, {
						method: "POST",
						credentials: "same-origin",
						headers: { accept: "application/json" }
					});
					if (!response.ok) throw new Error(`proxy test failed: ${String(response.status)}`);
					const result = await response.json();
					const current = scope?.getSnapshot().value;
					if (request !== currentProxyCheckRequest.current || current?.enableProxy !== true || normalizeOpenAICodexProxyUrl(current.proxyUrl) !== normalized) return;
					setCurrentProxyCheck(result.reachable ? {
						status: "success",
						result
					} : {
						status: "failed",
						result
					});
				} catch {
					const current = scope?.getSnapshot().value;
					if (request === currentProxyCheckRequest.current && current?.enableProxy === true && normalizeOpenAICodexProxyUrl(current.proxyUrl) === normalized) setCurrentProxyCheck({ status: "failed" });
				}
			};
			const validModel = draft !== void 0 && draft.searchModel.trim().length > 0;
			const validTokens = draft !== void 0 && Number.isInteger(draft.searchMaxOutputTokens) && draft.searchMaxOutputTokens > 0;
			const validProxy = draft !== void 0 && isValidOpenAICodexProxyUrl(draft.proxyUrl);
			const normalizedManualProxy = normalizeOpenAICodexProxyUrl(manualProxyUrl);
			const manualProxyEntered = manualProxyUrl.trim().length > 0;
			const testedManualProxy = normalizedManualProxy !== void 0 && manualProbe?.reachable === true && manualProbe.proxyUrl === normalizedManualProxy;
			const testedProxy = draft !== void 0 && manualProbe?.reachable === true && manualProbe.proxyUrl === normalizeOpenAICodexProxyUrl(draft.proxyUrl);
			const acceptedProxyUnchanged = draft?.enableProxy === true && snapshot.value?.enableProxy === true && normalizeOpenAICodexProxyUrl(draft.proxyUrl) === normalizeOpenAICodexProxyUrl(snapshot.value.proxyUrl);
			const validProxySelection = draft?.enableProxy !== true || acceptedProxyUnchanged || testedProxy;
			const validContexts = draft !== void 0 && isValidOpenAICodexContextWindowOverrides(draft.contextWindowOverrides ?? {}) && Object.entries(draft.contextWindowOverrides ?? {}).every(([id, budget]) => {
				const model = modelCatalog?.find((entry) => entry.id === id);
				return model !== void 0 && isValidOpenAICodexContextBudget(budget, model.maxContextWindow);
			});
			const valid = validModel && validTokens && validProxy && validContexts && validProxySelection;
			const save = async () => {
				if (scope === void 0 || draft === void 0 || !snapshot.writable || !valid) return;
				const desired = {
					...draft,
					searchModel: draft.searchModel.trim()
				};
				setBusy(true);
				setFeedback("idle");
				try {
					for (const field of CONFIG_FIELDS) {
						const accepted = scope.getSnapshot().value;
						if (accepted !== void 0 && sameField(field, accepted[field], desired[field])) continue;
						const value = field === "contextWindowOverrides" ? {
							...Object.fromEntries((modelCatalog ?? []).map((model) => [model.id, null])),
							...desired.contextWindowOverrides
						} : desired[field];
						await scope.set(field, value);
						const committed = scope.getSnapshot().value;
						if (committed === void 0 || !sameField(field, committed[field], desired[field])) throw new Error(`Host refused ${field}`);
					}
					const accepted = scope.getSnapshot().value;
					if (!sameConfig(accepted, desired)) throw new Error("Host returned a different configuration");
					setDraft(accepted);
					setDirty(false);
					setFeedback("saved");
					clearCurrentProxyCheck();
				} catch {
					setFeedback("error");
				} finally {
					setBusy(false);
				}
			};
			const loading = snapshot.status === "loading";
			const editable = snapshot.status === "ready" && snapshot.writable && !busy;
			const searchDisabled = !editable || draft?.enableSearch !== true;
			const savedProxyUrl = snapshot.value?.enableProxy === true ? normalizeOpenAICodexProxyUrl(snapshot.value.proxyUrl) : void 0;
			const draftProxyUrl = draft?.enableProxy === true ? normalizeOpenAICodexProxyUrl(draft.proxyUrl) : void 0;
			const proxyDraftChanged = snapshot.value !== void 0 && draft !== void 0 && (snapshot.value.enableProxy !== draft.enableProxy || normalizeOpenAICodexProxyUrl(snapshot.value.proxyUrl) !== normalizeOpenAICodexProxyUrl(draft.proxyUrl));
			const manualProxyIsCurrent = normalizedManualProxy !== void 0 && savedProxyUrl === normalizedManualProxy;
			const manualProxyIsSelected = !manualProxyIsCurrent && normalizedManualProxy !== void 0 && draftProxyUrl === normalizedManualProxy;
			const visibleModule = activeModule ?? localModule;
			const panelPrefix = panelIdPrefix ?? localPanelIdPrefix;
			const selectLocalModule = (module) => {
				setLocalModule(module);
				document.getElementById(`${panelPrefix}-${module}-tab`)?.focus();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: {
					...sectionStyle$1,
					display: visibleModule === "account" && !dirty ? "none" : sectionStyle$1.display
				},
				"aria-label": t("configurationHeading"),
				children: [
					loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle$2,
						role: "status",
						children: t("settingsLoading")
					}) : null,
					snapshot.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("settingsUnavailable")
					}) : null,
					snapshot.status === "ready" && !snapshot.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("settingsReadOnly")
					}) : null,
					draft === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [activeModule === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: moduleTabsStyle$1,
						role: "tablist",
						"aria-label": t("settingsModules"),
						children: CONFIGURATION_MODULES.map((module, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							id: `${panelPrefix}-${module}-tab`,
							type: "button",
							role: "tab",
							"aria-label": t(`${module}Module`),
							"aria-selected": localModule === module,
							"aria-controls": `${panelPrefix}-${module}`,
							tabIndex: localModule === module ? 0 : -1,
							style: localModule === module ? activeModuleTabStyle$1 : moduleTabStyle$1,
							onClick: () => {
								setLocalModule(module);
							},
							onKeyDown: (event) => {
								if (![
									"ArrowLeft",
									"ArrowRight",
									"Home",
									"End"
								].includes(event.key)) return;
								event.preventDefault();
								const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? CONFIGURATION_MODULES.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + CONFIGURATION_MODULES.length) % CONFIGURATION_MODULES.length;
								selectLocalModule(CONFIGURATION_MODULES[nextIndex]);
							},
							children: t(`${module}Module`)
						}, module))
					}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
						style: fieldsetStyle,
						disabled: !editable,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								id: `${panelPrefix}-models`,
								role: "tabpanel",
								"aria-labelledby": `${panelPrefix}-models-tab`,
								hidden: visibleModule !== "models",
								style: {
									...fieldsetStyle,
									display: visibleModule === "models" ? fieldsetStyle.display : "none"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										style: headingStyle,
										children: t("modelCatalog")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: {
											...bodyStyle$2,
											marginTop: 4
										},
										children: t("modelCatalogIntro")
									})] }),
									modelCatalog === void 0 && !modelCatalogError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: bodyStyle$2,
										role: "status",
										children: t("modelCatalogLoading")
									}) : null,
									modelCatalogError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: errorStyle$2,
										role: "alert",
										children: t("modelCatalogFailed")
									}) : null,
									modelCatalog === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: modelListStyle,
										role: "group",
										"aria-label": t("modelCatalog"),
										children: modelCatalog.map((model) => {
											const selected = draft.models === void 0 || draft.models.includes(model.id);
											const budget = draft.contextWindowOverrides?.[model.id];
											const invalidBudget = budget !== void 0 && !isValidOpenAICodexContextBudget(budget, model.maxContextWindow);
											const effectiveBudget = budget ?? model.contextWindow;
											const changeBudget = (value) => {
												update("contextWindowOverrides", {
													...draft.contextWindowOverrides,
													[model.id]: value
												});
											};
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												role: "group",
												"aria-label": model.name,
												style: {
													minWidth: 0,
													padding: "10px 0",
													borderBottom: "1px solid var(--dsw-alias-border-l2)"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "flex",
														alignItems: "center",
														justifyContent: "space-between",
														flexWrap: "wrap",
														gap: 8
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
														style: {
															...modelRowStyle,
															minWidth: 0,
															overflowWrap: "anywhere"
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															type: "checkbox",
															checked: selected,
															onChange: (event) => {
																const visible = new Set(draft.models ?? modelCatalog.map((entry) => entry.id));
																if (event.currentTarget.checked) visible.add(model.id);
																else visible.delete(model.id);
																update("models", modelCatalog.filter((entry) => visible.has(entry.id)).map((entry) => entry.id));
															}
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.name }), model.name === model.id ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															style: modelIdStyle,
															children: [
																" (",
																model.id,
																")"
															]
														})] })]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															...buttonsStyle,
															alignItems: "center",
															flexWrap: "wrap"
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															style: bodyStyle$2,
															children: [
																t("modelContext"),
																": ",
																invalidBudget ? t("contextCustom") : `${effectiveBudget.toLocaleString()} tokens${budget === void 0 ? ` · ${t("contextDefault")}` : ""}`
															]
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															style: buttonStyle$3,
															"aria-expanded": expandedModels[model.id] === true,
															onClick: () => {
																setExpandedModels((current) => ({
																	...current,
																	[model.id]: !current[model.id]
																}));
															},
															children: expandedModels[model.id] === true ? t("contextHide") : t("contextAdjust")
														})]
													})]
												}), expandedModels[model.id] === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													role: "group",
													"aria-label": t("contextTokens"),
													style: {
														display: "flex",
														flexDirection: "column",
														gap: 8,
														marginTop: 12
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
															style: {
																display: "flex",
																alignItems: "center",
																justifyContent: "space-between",
																gap: 12
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																style: labelStyle,
																children: t("contextTokens")
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																type: "number",
																min: 1,
																step: 1,
																max: model.maxContextWindow,
																style: {
																	...controlStyle,
																	width: 112,
																	flexShrink: 0,
																	textAlign: "right",
																	fontVariantNumeric: "tabular-nums"
																},
																value: Number.isNaN(effectiveBudget) ? "" : effectiveBudget,
																"aria-invalid": invalidBudget,
																onChange: (event) => {
																	changeBudget(event.currentTarget.valueAsNumber);
																}
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																...bodyStyle$2,
																display: "flex",
																alignItems: "center",
																justifyContent: "space-between",
																flexWrap: "wrap",
																gap: 8
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																style: {
																	display: "inline-flex",
																	alignItems: "center",
																	gap: 6
																},
																children: [
																	model.contextLimitSource === "codex-catalog" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
																		href: OPENAI_CODEX_CONTEXT_LIMIT_SOURCE,
																		target: "_blank",
																		rel: "noopener noreferrer",
																		title: t("contextLimitSource"),
																		style: {
																			color: "inherit",
																			textDecorationStyle: "dotted",
																			textUnderlineOffset: 3
																		},
																		children: t("contextMaximum")
																	}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		title: t("contextLimitFallback"),
																		children: t("contextMaximum")
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		style: {
																			padding: "1px 6px",
																			borderRadius: 4,
																			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))",
																			fontVariantNumeric: "tabular-nums"
																		},
																		children: model.maxContextWindow
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "tokens" })
																]
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																title: `${t("contextDefault")}: ${model.contextWindow.toLocaleString()} tokens`,
																style: {
																	...bodyStyle$2,
																	padding: "2px 0",
																	border: 0,
																	background: "transparent",
																	font: "inherit",
																	fontSize: 12,
																	cursor: "pointer",
																	textDecoration: "underline",
																	textUnderlineOffset: 3
																},
																onClick: () => {
																	const overrides = { ...draft.contextWindowOverrides };
																	delete overrides[model.id];
																	update("contextWindowOverrides", overrides);
																},
																children: t("contextReset")
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															type: "range",
															min: 1,
															max: model.maxContextWindow,
															step: 1,
															"aria-label": t("contextSlider"),
															"aria-valuetext": invalidBudget ? t("contextInvalid") : `${effectiveBudget.toLocaleString()} tokens`,
															style: {
																width: "100%",
																height: 20,
																margin: 0,
																accentColor: "var(--dsw-alias-label-secondary)"
															},
															value: invalidBudget ? model.contextWindow : effectiveBudget,
															onChange: (event) => {
																changeBudget(event.currentTarget.valueAsNumber);
															}
														}),
														budget !== void 0 && budget > model.contextWindow && !invalidBudget ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: bodyStyle$2,
															role: "status",
															children: t("contextAboveDefault")
														}) : null,
														invalidBudget ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
															style: errorStyle$2,
															role: "alert",
															children: [
																t("contextInvalid"),
																" (1–",
																model.maxContextWindow.toLocaleString(),
																")"
															]
														}) : null
													]
												}) : null]
											}, model.id);
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: bodyStyle$2,
										children: t("contextWarning")
									}),
									!validContexts ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: errorStyle$2,
										role: "alert",
										children: t("contextInvalid")
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								id: `${panelPrefix}-network`,
								role: "tabpanel",
								"aria-labelledby": `${panelPrefix}-network-tab`,
								hidden: visibleModule !== "network",
								style: {
									...fieldsetStyle,
									display: visibleModule === "network" ? fieldsetStyle.display : "none"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: { paddingTop: 4 },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											style: headingStyle,
											children: t("networkHeading")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											style: {
												...bodyStyle$2,
												marginTop: 4
											},
											children: t("networkIntro")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: fieldsetStyle,
										role: "group",
										"aria-label": t("currentConnection"),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
											style: headingStyle,
											children: t("currentConnection")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: connectionCardStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: { minWidth: 0 },
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: labelStyle,
														children: savedProxyUrl === void 0 ? t("directConnection") : t("proxyEnabled")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: {
															...modelIdStyle,
															marginTop: 3,
															overflowWrap: "anywhere"
														},
														children: savedProxyUrl ?? t("directConnectionDescription")
													}),
													currentProxyCheck.status === "checking" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: {
															...bodyStyle$2,
															marginTop: 5
														},
														role: "status",
														children: t("checkingCurrentConnection")
													}) : null,
													currentProxyCheck.status === "success" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: {
															...successStyle,
															marginTop: 5
														},
														role: "status",
														children: t("currentConnectionHealthy")
													}) : null,
													currentProxyCheck.status === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: {
															...errorStyle$2,
															marginTop: 5
														},
														role: "status",
														children: t("currentConnectionFailed")
													}) : null
												]
											}), savedProxyUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													...buttonsStyle,
													flexWrap: "wrap"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													style: proxyButtonStyle,
													disabled: currentProxyCheck.status === "checking",
													onClick: () => {
														checkCurrentProxy();
													},
													children: currentProxyCheck.status === "checking" ? t("checkingCurrentConnectionButton") : t("checkCurrentConnection")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													style: {
														...proxyButtonStyle,
														borderColor: "transparent",
														background: "transparent",
														color: "var(--dsw-alias-state-error-primary)"
													},
													onClick: () => {
														clearCurrentProxyCheck();
														update("enableProxy", false);
													},
													children: t("disableProxy")
												})]
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: fieldsetStyle,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
												style: headingStyle,
												children: t("changeConnection")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: proxyTabsStyle,
												role: "tablist",
												"aria-label": t("proxyConfigurationMethod"),
												children: ["auto", "manual"].map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													role: "tab",
													"aria-selected": proxyMode === mode,
													"aria-controls": `openai-codex-proxy-${mode}`,
													tabIndex: proxyMode === mode ? 0 : -1,
													style: proxyMode === mode ? activeProxyTabStyle : proxyTabStyle,
													onClick: () => {
														setProxyMode(mode);
													},
													onKeyDown: (event) => {
														if (![
															"ArrowLeft",
															"ArrowRight",
															"Home",
															"End"
														].includes(event.key)) return;
														event.preventDefault();
														const next = event.key === "ArrowRight" || event.key === "End" ? "manual" : "auto";
														setProxyMode(next);
														document.getElementById(`openai-codex-proxy-${next}-tab`)?.focus();
													},
													id: `openai-codex-proxy-${mode}-tab`,
													children: mode === "auto" ? t("automaticDetection") : t("manualEntry")
												}, mode))
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												id: "openai-codex-proxy-auto",
												role: "tabpanel",
												"aria-labelledby": "openai-codex-proxy-auto-tab",
												hidden: proxyMode !== "auto",
												style: {
													...fieldsetStyle,
													display: proxyMode === "auto" ? fieldsetStyle.display : "none"
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: actionsStyle,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: bodyStyle$2,
															children: t("automaticDetectionHelp")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															style: proxyButtonStyle,
															onClick: () => {
																detectProxy();
															},
															disabled: proxyDetection.status === "detecting",
															children: proxyDetection.status === "detecting" ? t("detectingProxy") : t("scanLocalProxy")
														})]
													}),
													proxyDetection.status === "candidate" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: fieldsetStyle,
														role: "status",
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: bodyStyle$2,
															children: t("proxyCandidatesFound")
														}), proxyDetection.candidates.map((candidate) => {
															const normalized = normalizeOpenAICodexProxyUrl(candidate.proxyUrl);
															const current = normalized !== void 0 && savedProxyUrl === normalized;
															const selected = !current && normalized !== void 0 && draftProxyUrl === normalized;
															return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: candidateStyle,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		display: "flex",
																		flexDirection: "column",
																		gap: 3,
																		minWidth: 0
																	},
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
																		style: {
																			...modelIdStyle,
																			overflowWrap: "anywhere"
																		},
																		children: candidate.proxyUrl
																	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		style: successStyle,
																		children: t("proxyCandidateHealthy")
																	})]
																}), current || selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	style: statePillStyle,
																	children: current ? t("currentProxy") : t("selectedProxy")
																}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																	type: "button",
																	style: primaryProxyButtonStyle,
																	onClick: () => {
																		useProxy(candidate.proxyUrl);
																	},
																	children: t("useThisProxy")
																})]
															}, candidate.proxyUrl);
														})]
													}) : null,
													proxyDetection.status === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														style: candidateStyle,
														role: "alert",
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: errorStyle$2,
															children: t("proxyDetectionFailedTitle")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: {
																...bodyStyle$2,
																marginTop: 3
															},
															children: t("proxyDetectionFailed")
														})] })
													}) : null
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												id: "openai-codex-proxy-manual",
												role: "tabpanel",
												"aria-labelledby": "openai-codex-proxy-manual-tab",
												hidden: proxyMode !== "manual",
												style: {
													...fieldsetStyle,
													display: proxyMode === "manual" ? fieldsetStyle.display : "none"
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: bodyStyle$2,
														children: t("manualProxyHelp")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
														style: formFieldStyle,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: labelStyle,
															children: t("proxyAddress")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															style: {
																...controlStyle,
																minHeight: 44
															},
															value: manualProxyUrl,
															"aria-invalid": manualProxyEntered && normalizedManualProxy === void 0,
															onChange: (event) => {
																manualProbeRequest.current += 1;
																setManualProbeBusy(false);
																setManualProbe(void 0);
																setManualProxyUrl(event.currentTarget.value);
																setFeedback("idle");
															}
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															...buttonsStyle,
															flexWrap: "wrap"
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															style: proxyButtonStyle,
															disabled: normalizedManualProxy === void 0 || manualProbeBusy,
															onClick: () => {
																testManualProxy();
															},
															children: manualProbeBusy ? t("testingProxy") : t("testProxy")
														}), manualProxyIsCurrent || manualProxyIsSelected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: statePillStyle,
															children: manualProxyIsCurrent ? t("currentProxy") : t("selectedProxy")
														}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															style: primaryProxyButtonStyle,
															disabled: !testedManualProxy,
															onClick: () => {
																useProxy(manualProxyUrl);
															},
															children: t("useThisProxy")
														})]
													}),
													manualProbe === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: manualProbe.reachable ? successStyle : errorStyle$2,
														role: "status",
														children: manualProbe.reachable ? t("proxyTestSucceeded", { status: manualProbe.status ?? manualProbe.classification }) : t("proxyTestFailed", { reason: manualProbe.classification })
													}),
													manualProxyEntered && normalizedManualProxy === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: errorStyle$2,
														role: "alert",
														children: t("invalidProxyUrl")
													}) : null,
													normalizedManualProxy !== void 0 && !manualProxyIsCurrent && !manualProxyIsSelected && !testedManualProxy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: bodyStyle$2,
														children: t("proxyTestRequired")
													}) : null
												]
											})
										]
									}),
									proxyDraftChanged ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: pendingStyle,
										role: "status",
										children: draft.enableProxy ? t("pendingProxy", { proxyUrl: draft.proxyUrl }) : t("pendingDirect")
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								id: `${panelPrefix}-capabilities`,
								role: "tabpanel",
								"aria-labelledby": `${panelPrefix}-capabilities-tab`,
								hidden: visibleModule !== "capabilities",
								style: {
									...fieldsetStyle,
									display: visibleModule === "capabilities" ? fieldsetStyle.display : "none"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: { paddingTop: 4 },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											style: headingStyle,
											children: t("capabilitiesHeading")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											style: {
												...bodyStyle$2,
												marginTop: 4
											},
											children: t("capabilitiesIntro")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: toggleRowStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: draft.enableSearch,
											onChange: (event) => {
												update("enableSearch", event.currentTarget.checked);
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: toggleCopyStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("enableSearch")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$2,
												children: t("enableSearchHelp")
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: formGridStyle,
										"aria-disabled": searchDisabled,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: formFieldStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("searchModel")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													style: controlStyle,
													value: draft.searchModel,
													disabled: searchDisabled,
													"aria-invalid": !validModel,
													onChange: (event) => {
														update("searchModel", event.currentTarget.value);
													}
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: formFieldStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("searchMode")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
													style: controlStyle,
													value: draft.searchMode,
													disabled: searchDisabled,
													onChange: (event) => {
														update("searchMode", event.currentTarget.value);
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "cached",
															children: t("modeCached")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "indexed",
															children: t("modeIndexed")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "live",
															children: t("modeLive")
														})
													]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: formFieldStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("searchContextSize")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
													style: controlStyle,
													value: draft.searchContextSize,
													disabled: searchDisabled,
													onChange: (event) => {
														update("searchContextSize", event.currentTarget.value);
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "low",
															children: t("contextLow")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "medium",
															children: t("contextMedium")
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
															value: "high",
															children: t("contextHigh")
														})
													]
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: formFieldStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("searchMaxOutputTokens")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													style: controlStyle,
													type: "number",
													min: 1,
													step: 1,
													value: draft.searchMaxOutputTokens,
													disabled: searchDisabled,
													"aria-invalid": !validTokens,
													onChange: (event) => {
														update("searchMaxOutputTokens", event.currentTarget.valueAsNumber);
													}
												})]
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: toggleRowStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: draft.enableImageTool,
											onChange: (event) => {
												update("enableImageTool", event.currentTarget.checked);
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: toggleCopyStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("enableImageTool")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$2,
												children: t("enableImageToolHelp")
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: toggleRowStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: draft.enableImageGeneration,
											onChange: (event) => {
												update("enableImageGeneration", event.currentTarget.checked);
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: toggleCopyStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("enableImageGeneration")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$2,
												children: t("enableImageGenerationHelp")
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: toggleRowStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: draft.enableAutoReview,
											onChange: (event) => {
												if (!event.currentTarget.checked) {
													update("enableAutoReview", false);
													return;
												}
												if (draft.autoReviewDisclosureAcknowledged) update("enableAutoReview", true);
												else setAutoReviewConfirmOpen(true);
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: toggleCopyStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: {
													display: "flex",
													alignItems: "center",
													flexWrap: "wrap",
													gap: 6
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("enableAutoReview")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: badgeStyle,
													children: t("autoReviewOfficialBadge")
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$2,
												children: t("enableAutoReviewHelp")
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
										style: { marginLeft: 26 },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
											style: {
												...bodyStyle$2,
												cursor: "pointer",
												textDecoration: "underline",
												textUnderlineOffset: 3
											},
											children: t("autoReviewDetails")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												flexDirection: "column",
												gap: 6,
												marginTop: 6
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													style: bodyStyle$2,
													children: t("autoReviewDisclosure")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													style: bodyStyle$2,
													children: t("autoReviewFailureDisclosure")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
													href: "https://learn.chatgpt.com/docs/sandboxing/auto-review",
													target: "_blank",
													rel: "noopener noreferrer",
													style: {
														...bodyStyle$2,
														textDecoration: "underline",
														textUnderlineOffset: 3
													},
													children: t("autoReviewOfficialDocs")
												})
											]
										})]
									})
								]
							})
						]
					})] }),
					autoReviewConfirmOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AutoReviewConsentDialog, {
						t,
						onCancel: () => {
							setAutoReviewConfirmOpen(false);
						},
						onConfirm: confirmAutoReview
					}) : null,
					visibleModule === "capabilities" && !validModel && draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("invalidSearchModel")
					}) : null,
					visibleModule === "capabilities" && !validTokens && draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("invalidSearchTokens")
					}) : null,
					visibleModule === "network" && !validProxy && draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("invalidProxyUrl")
					}) : null,
					visibleModule === "capabilities" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle$2,
						children: t("routingNote")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...actionsStyle,
							position: "sticky",
							bottom: 0,
							zIndex: 1,
							padding: "10px 0",
							background: "var(--dsw-alias-bg-layer-1, white)"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							"aria-live": "polite",
							children: [feedback === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: successStyle,
								children: t("settingsSaved")
							}) : null, feedback === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: errorStyle$2,
								children: t("settingsSaveFailed")
							}) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: buttonsStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...buttonStyle$3,
									minHeight: 44
								},
								disabled: !dirty || busy,
								onClick: discard,
								children: t("discard")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...primaryButtonStyle$2,
									minHeight: 44
								},
								disabled: !dirty || !valid || !snapshot.writable || busy,
								onClick: () => {
									save();
								},
								children: busy ? t("saving") : t("save")
							})]
						})]
					})
				]
			});
		}
		const OPENAI_CODEX_RELEASE_PAGE_BASE = "https://github.com/franksong2702/dsh-codex-connect/releases/tag/v";
		const HIGHLIGHT_KINDS = [
			"trusted-origins",
			"runtime-compatibility",
			"quota-fast-mode",
			"dsh-rc7",
			"search-stability",
			"image-generation",
			"oauth-history",
			"model-visibility",
			"proxy-connection",
			"models-account",
			"context-budget",
			"auto-review-probe",
			"auto-review",
			"astra-compatibility",
			"multi-account",
			"search-route"
		];
		function isHighlightKind(value) {
			return typeof value === "string" && HIGHLIGHT_KINDS.includes(value);
		}
		function parseVersionParts(raw) {
			const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u.exec(raw);
			if (match === null) return void 0;
			const rawPrerelease = match[4] === void 0 ? [] : match[4].split(".");
			if (rawPrerelease.some((identifier) => /^\d+$/u.test(identifier) && !/^(0|[1-9]\d*)$/u.test(identifier))) return void 0;
			const prerelease = rawPrerelease.map((identifier) => /^(0|[1-9]\d*)$/u.test(identifier) ? Number(identifier) : identifier);
			if (prerelease.some((identifier) => typeof identifier === "number" && !Number.isSafeInteger(identifier))) return void 0;
			const parsed = {
				major: Number(match[1]),
				minor: Number(match[2]),
				patch: Number(match[3]),
				prerelease
			};
			return [
				parsed.major,
				parsed.minor,
				parsed.patch
			].every(Number.isSafeInteger) ? parsed : void 0;
		}
		/** Parse one exact package version, accepting the conventional leading `v`. */
		function parseOpenAICodexVersion(raw) {
			if (typeof raw !== "string") return void 0;
			return parseVersionParts(raw.startsWith("v") ? raw.slice(1) : raw);
		}
		function compareIdentifiers(left, right) {
			if (typeof left === "number" && typeof right === "number") return left < right ? -1 : left > right ? 1 : 0;
			if (typeof left === "number") return -1;
			if (typeof right === "number") return 1;
			return left < right ? -1 : left > right ? 1 : 0;
		}
		/** Compare two package versions using SemVer precedence (build metadata ignored). */
		function compareOpenAICodexVersions(left, right) {
			const a = parseOpenAICodexVersion(left);
			const b = parseOpenAICodexVersion(right);
			if (a === void 0 || b === void 0) throw new TypeError("invalid OpenAI Codex version");
			for (const [aPart, bPart] of [
				[a.major, b.major],
				[a.minor, b.minor],
				[a.patch, b.patch]
			]) if (aPart !== bPart) return aPart < bPart ? -1 : 1;
			if (a.prerelease.length === 0 && b.prerelease.length !== 0) return 1;
			if (a.prerelease.length !== 0 && b.prerelease.length === 0) return -1;
			for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
				const aPart = a.prerelease[index];
				const bPart = b.prerelease[index];
				if (aPart === void 0) return -1;
				if (bPart === void 0) return 1;
				const comparison = compareIdentifiers(aPart, bPart);
				if (comparison !== 0) return comparison;
			}
			return 0;
		}
		function cleanReleaseText(value, maxLength) {
			if (typeof value !== "string" || value.length === 0) return void 0;
			const clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "").replace(/\r\n?/gu, "\n").trim().slice(0, maxLength);
			return clean.length === 0 ? void 0 : clean;
		}
		function releaseUrl(version) {
			return `${OPENAI_CODEX_RELEASE_PAGE_BASE}${version}`;
		}
		function validCanaryTrackerUrl(value) {
			return typeof value === "string" && /^https:\/\/github\.com\/franksong2702\/dsh-codex-connect\/issues\/[1-9]\d*$/u.test(value);
		}
		/** Validate a route response before it is rendered by the browser. */
		function parseOpenAICodexUpdateResult(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const record = value;
			const currentVersion = record["currentVersion"];
			if (typeof currentVersion !== "string" || parseOpenAICodexVersion(currentVersion) === void 0) return void 0;
			const rawCurrentDshVersion = record["currentDshVersion"];
			const currentDshVersion = rawCurrentDshVersion === void 0 ? void 0 : typeof rawCurrentDshVersion === "string" && parseOpenAICodexVersion(rawCurrentDshVersion) !== void 0 ? rawCurrentDshVersion : void 0;
			if (rawCurrentDshVersion !== void 0 && currentDshVersion === void 0) return void 0;
			const currentDsh = currentDshVersion === void 0 ? {} : { currentDshVersion };
			if (record["status"] === "unavailable") {
				const reason = record["reason"];
				return reason === "invalid-current-version" || reason === "registry-unavailable" || reason === "invalid-registry-response" ? {
					status: "unavailable",
					currentVersion,
					...currentDsh,
					reason
				} : void 0;
			}
			const latestVersion = record["latestVersion"];
			if (typeof latestVersion !== "string" || parseOpenAICodexVersion(latestVersion) === void 0) return void 0;
			const compatibility = parseOpenAICodexDshCompatibilityAdvice(record["compatibility"], latestVersion);
			if (compatibility === void 0) return void 0;
			if (currentDshVersion === void 0 && compatibility.status !== "unverified") return void 0;
			if (record["status"] === "up-to-date") return {
				status: "up-to-date",
				currentVersion,
				...currentDsh,
				latestVersion,
				compatibility
			};
			if (record["status"] !== "update-available" || compareOpenAICodexVersions(latestVersion, currentVersion) <= 0) return void 0;
			const expectedUrl = releaseUrl(latestVersion);
			if (record["releaseUrl"] !== expectedUrl) return void 0;
			const rawVersionsBehind = record["versionsBehind"];
			const versionsBehind = rawVersionsBehind === void 0 ? void 0 : typeof rawVersionsBehind === "number" && Number.isSafeInteger(rawVersionsBehind) && rawVersionsBehind > 0 && rawVersionsBehind <= 256 ? rawVersionsBehind : void 0;
			if (rawVersionsBehind !== void 0 && versionsBehind === void 0) return void 0;
			const rawHighlights = record["highlights"];
			const highlights = rawHighlights === void 0 ? [] : Array.isArray(rawHighlights) ? rawHighlights.flatMap((value) => {
				if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
				const highlight = value;
				const version = highlight["version"];
				const kind = highlight["kind"];
				if (typeof version !== "string" || parseOpenAICodexVersion(version) === void 0) return [];
				if (!isHighlightKind(kind)) return [];
				return [{
					version,
					kind
				}];
			}) : void 0;
			if (highlights === void 0 || Array.isArray(rawHighlights) && highlights.length !== rawHighlights.length) return void 0;
			const releaseName = cleanReleaseText(record["releaseName"], 200);
			const releaseNotes = cleanReleaseText(record["releaseNotes"], 16e3);
			const publishedAt = typeof record["publishedAt"] === "string" && /^\d{4}-\d{2}-\d{2}T/iu.test(record["publishedAt"]) ? record["publishedAt"].slice(0, 64) : void 0;
			return {
				status: "update-available",
				currentVersion,
				...currentDsh,
				latestVersion,
				releaseUrl: expectedUrl,
				highlights,
				compatibility,
				...versionsBehind === void 0 ? {} : { versionsBehind },
				...releaseName === void 0 ? {} : { releaseName },
				...releaseNotes === void 0 ? {} : { releaseNotes },
				...publishedAt === void 0 ? {} : { publishedAt }
			};
		}
		function parseOpenAICodexDshCompatibilityAdvice(value, latestPluginVersion) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const record = value;
			const status = record["status"];
			if (status !== "compatible" && status !== "plugin-update-required" && status !== "dsh-update-required" && status !== "not-yet-compatible" && status !== "unverified") return void 0;
			if (record["latestPluginVersion"] !== latestPluginVersion) return void 0;
			const latestDshVersion = record["latestDshVersion"];
			const reportCompatibilityGap = record["reportCompatibilityGap"];
			const trackerUrl = record["trackerUrl"];
			if (reportCompatibilityGap !== void 0 && reportCompatibilityGap !== true) return void 0;
			if (reportCompatibilityGap === true && status !== "not-yet-compatible") return void 0;
			if (trackerUrl !== void 0 && (reportCompatibilityGap !== true || !validCanaryTrackerUrl(trackerUrl))) return void 0;
			if (status === "unverified") {
				if (latestDshVersion === void 0) return {
					status,
					latestPluginVersion
				};
				if (typeof latestDshVersion !== "string" || parseOpenAICodexVersion(latestDshVersion) === void 0) return void 0;
				return {
					status,
					latestPluginVersion,
					latestDshVersion
				};
			}
			if (typeof latestDshVersion !== "string" || parseOpenAICodexVersion(latestDshVersion) === void 0) return void 0;
			return {
				status,
				latestPluginVersion,
				latestDshVersion,
				...reportCompatibilityGap === true ? { reportCompatibilityGap: true } : {},
				...trackerUrl === void 0 ? {} : { trackerUrl }
			};
		}
		//#endregion
		//#region src/update-paths.ts
		/** Same-origin route used by the browser update reminder. */
		const OPENAI_CODEX_UPDATE_PATH = "/openai-codex/update";
		const OPENAI_CODEX_RUNTIME_PATH = "/openai-codex/runtime";
		//#endregion
		//#region src/client/update-store.ts
		/** Browser-owned cache and observable state for the global update reminder. */
		const OPENAI_CODEX_REPOSITORY_URL = "https://github.com/franksong2702/dsh-codex-connect";
		const OPENAI_CODEX_UPDATE_CACHE_KEY = "dsh-codex-connect:update-check";
		const OPENAI_CODEX_UPDATE_DISMISSED_KEY = "dsh-codex-connect:update-dismissed";
		function storage() {
			try {
				return typeof localStorage === "undefined" ? void 0 : localStorage;
			} catch {
				return;
			}
		}
		function resultSnapshot(result, dismissedNotice) {
			return {
				status: result.status,
				currentVersion: result.currentVersion,
				...result.currentDshVersion === void 0 ? {} : { currentDshVersion: result.currentDshVersion },
				...result.status === "up-to-date" || result.status === "update-available" ? {
					latestVersion: result.latestVersion,
					compatibility: result.compatibility
				} : {},
				...result.status === "update-available" && result.versionsBehind !== void 0 ? { versionsBehind: result.versionsBehind } : {},
				...result.status === "update-available" ? { highlights: result.highlights } : {},
				...result.status === "update-available" ? {
					releaseUrl: result.releaseUrl,
					...result.releaseName === void 0 ? {} : { releaseName: result.releaseName },
					...result.releaseNotes === void 0 ? {} : { releaseNotes: result.releaseNotes },
					...result.publishedAt === void 0 ? {} : { publishedAt: result.publishedAt }
				} : {},
				...dismissedNotice === void 0 ? {} : { dismissedNotice }
			};
		}
		/** Observable browser state shared by the global overlay and settings card. */
		var OpenAICodexUpdateStore = class {
			currentVersion;
			snapshot;
			listeners = /* @__PURE__ */ new Set();
			request;
			disposed = false;
			constructor(currentVersion) {
				this.currentVersion = currentVersion;
				this.snapshot = {
					status: "idle",
					currentVersion
				};
			}
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			setSnapshot(next) {
				if (this.disposed) return;
				this.snapshot = next;
				for (const listener of this.listeners) listener();
			}
			dismissedNotice() {
				try {
					const value = storage()?.getItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY);
					return value === null || value === "" ? void 0 : value;
				} catch {
					return;
				}
			}
			readCached() {
				try {
					const raw = storage()?.getItem(OPENAI_CODEX_UPDATE_CACHE_KEY);
					if (raw === null || raw === void 0) return void 0;
					const cached = JSON.parse(raw);
					if (!Number.isSafeInteger(cached.checkedAt) || Date.now() - cached.checkedAt > 864e5) return void 0;
					return parseOpenAICodexUpdateResult(cached.result);
				} catch {
					return;
				}
			}
			writeCached(result) {
				if (result.status === "unavailable") return;
				try {
					storage()?.setItem(OPENAI_CODEX_UPDATE_CACHE_KEY, JSON.stringify({
						checkedAt: Date.now(),
						result
					}));
				} catch {}
			}
			/** Check once per day by default; force=true is used by the settings button. */
			async refresh(force = false) {
				if (this.disposed || this.request !== void 0) return;
				const controller = new AbortController();
				this.request = controller;
				let currentDshVersion;
				this.setSnapshot({
					status: "checking",
					currentVersion: this.currentVersion,
					...this.snapshot.dismissedNotice === void 0 ? {} : { dismissedNotice: this.snapshot.dismissedNotice }
				});
				try {
					const runtimeResponse = await fetch(OPENAI_CODEX_RUNTIME_PATH, {
						method: "GET",
						headers: { accept: "application/json" },
						credentials: "same-origin",
						signal: controller.signal
					});
					const runtimeValue = await runtimeResponse.json().catch(() => void 0);
					const rawCurrentDshVersion = (typeof runtimeValue === "object" && runtimeValue !== null && !Array.isArray(runtimeValue) ? runtimeValue : void 0)?.["currentDshVersion"];
					currentDshVersion = runtimeResponse.ok && typeof rawCurrentDshVersion === "string" && parseOpenAICodexVersion(rawCurrentDshVersion) !== void 0 ? rawCurrentDshVersion : void 0;
					const currentDsh = currentDshVersion === void 0 ? {} : { currentDshVersion };
					if (!force) {
						const cached = this.readCached();
						if (cached !== void 0 && cached.currentVersion === this.currentVersion && cached.currentDshVersion === currentDshVersion) {
							this.setSnapshot(resultSnapshot(cached, this.dismissedNotice()));
							return;
						}
					}
					const response = await fetch(OPENAI_CODEX_UPDATE_PATH, {
						method: "GET",
						headers: { accept: "application/json" },
						credentials: "same-origin",
						signal: controller.signal
					});
					const value = await response.json().catch(() => void 0);
					const safeResult = (response.ok ? parseOpenAICodexUpdateResult(value) : void 0) ?? {
						status: "unavailable",
						currentVersion: this.currentVersion,
						...currentDsh,
						reason: "registry-unavailable"
					};
					this.writeCached(safeResult);
					this.setSnapshot(resultSnapshot(safeResult, this.dismissedNotice()));
				} catch {
					if (!controller.signal.aborted && !this.disposed) {
						const unavailable = {
							status: "unavailable",
							currentVersion: this.currentVersion,
							...currentDshVersion === void 0 ? {} : { currentDshVersion },
							reason: "registry-unavailable"
						};
						this.writeCached(unavailable);
						this.setSnapshot(resultSnapshot(unavailable, this.dismissedNotice()));
					}
				} finally {
					if (this.request === controller) this.request = void 0;
				}
			}
			dismiss(notice) {
				try {
					storage()?.setItem(OPENAI_CODEX_UPDATE_DISMISSED_KEY, notice);
				} catch {}
				this.setSnapshot({
					...this.snapshot,
					dismissedNotice: notice
				});
			}
			dispose() {
				this.disposed = true;
				this.request?.abort();
				this.request = void 0;
				this.listeners.clear();
			}
		};
		//#endregion
		//#region src/client/OpenAICodexUpdateNotice.tsx
		/** Global and settings-page presentation for a Codex Connect update. */
		const panelStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 10,
			padding: "13px 15px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 12,
			background: "var(--dsw-alias-bg-module-platform)",
			color: "var(--dsw-alias-label-primary)"
		};
		const overlayStyle = {
			position: "absolute",
			top: 16,
			right: 20,
			zIndex: 30,
			width: "min(420px, calc(100vw - 40px))",
			boxSizing: "border-box",
			boxShadow: "0 8px 28px rgba(0, 0, 0, 0.16)"
		};
		const rowStyle$1 = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 12,
			flexWrap: "wrap"
		};
		const titleStyle$1 = {
			margin: 0,
			fontSize: 14,
			lineHeight: "20px",
			fontWeight: 600
		};
		const bodyStyle$1 = {
			margin: 0,
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 13,
			lineHeight: "20px"
		};
		const versionSummaryStyle = {
			margin: 0,
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 13,
			lineHeight: "20px"
		};
		const sectionStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 8
		};
		const actionStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			flexWrap: "wrap"
		};
		const linkRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 16,
			flexWrap: "wrap"
		};
		const buttonStyle$2 = {
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			boxSizing: "border-box",
			minHeight: 32,
			padding: "4px 11px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: 12,
			lineHeight: "20px",
			whiteSpace: "nowrap",
			cursor: "pointer"
		};
		const primaryButtonStyle$1 = {
			...buttonStyle$2,
			borderColor: "var(--dsw-alias-button-primary-fill)",
			background: "var(--dsw-alias-button-primary-fill)",
			color: "var(--dsw-alias-label-primary-foreground)"
		};
		const textButtonStyle = {
			border: 0,
			padding: 0,
			background: "transparent",
			color: "var(--dsw-alias-brand-primary)",
			font: "inherit",
			fontSize: 12,
			lineHeight: "20px",
			cursor: "pointer",
			textDecoration: "underline",
			textUnderlineOffset: 2
		};
		const notesStyle = {
			maxHeight: 220,
			overflowY: "auto",
			margin: 0,
			padding: "9px 10px",
			borderRadius: 7,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))",
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 12,
			lineHeight: "19px",
			overflowWrap: "anywhere"
		};
		const promptRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 8,
			padding: "7px 8px 7px 10px",
			borderRadius: 7,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))"
		};
		const promptTextStyle = {
			flex: "1 1 auto",
			minWidth: 0,
			margin: 0,
			padding: 0,
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			fontSize: 12,
			lineHeight: "19px",
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere"
		};
		const notesListStyle = {
			margin: "4px 0",
			paddingLeft: 18
		};
		const notesHeadingStyle = {
			margin: "0 0 4px",
			fontSize: 12,
			lineHeight: "19px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)"
		};
		const highlightsStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 7,
			margin: 0,
			padding: "9px 10px",
			borderRadius: 7,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))"
		};
		const compatibilityStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 5,
			margin: 0,
			padding: "9px 10px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))"
		};
		const statusStyle$1 = {
			margin: 0,
			padding: "7px 9px",
			borderRadius: 7,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))",
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 12,
			lineHeight: "19px"
		};
		const highlightKeys = {
			"trusted-origins": "updateHighlightTrustedOrigins",
			"runtime-compatibility": "updateHighlightRuntimeCompatibility",
			"quota-fast-mode": "updateHighlightQuotaFastMode",
			"dsh-rc7": "updateHighlightDshRc7",
			"search-stability": "updateHighlightSearchStability",
			"image-generation": "updateHighlightImageGeneration",
			"oauth-history": "updateHighlightOauthHistory",
			"model-visibility": "updateHighlightModelVisibility",
			"proxy-connection": "updateHighlightProxyConnection",
			"models-account": "updateHighlightModelsAccount",
			"context-budget": "updateHighlightContextBudget",
			"auto-review-probe": "updateHighlightAutoReviewProbe",
			"auto-review": "updateHighlightAutoReview",
			"astra-compatibility": "updateHighlightAstraCompatibility",
			"multi-account": "updateHighlightMultiAccount",
			"search-route": "updateHighlightSearchRoute"
		};
		const compatibilityTitleKeys = {
			compatible: "compatibilityCompatibleTitle",
			"plugin-update-required": "compatibilityPluginUpdateTitle",
			"dsh-update-required": "compatibilityDshUpdateTitle",
			"not-yet-compatible": "compatibilityNotReadyTitle",
			unverified: "compatibilityUnverifiedTitle"
		};
		const compatibilityBodyKeys = {
			compatible: "compatibilityCompatibleBody",
			"plugin-update-required": "compatibilityPluginUpdateBody",
			"dsh-update-required": "compatibilityDshUpdateBody",
			"not-yet-compatible": "compatibilityNotReadyBody",
			unverified: "compatibilityUnverifiedBody"
		};
		const compatibilityIcons = {
			compatible: "🟢",
			"plugin-update-required": "🟡",
			"dsh-update-required": "🟡",
			"not-yet-compatible": "🔴",
			unverified: "⚪"
		};
		function dshVersionSummary(current, latest, t) {
			if (current !== void 0 && latest !== void 0) return current === latest ? t("compatibilityDshSame", { version: current }) : t("compatibilityDshDifferent", {
				current,
				latest
			});
			if (current !== void 0) return t("compatibilityDshCurrentOnly", { current });
			if (latest !== void 0) return t("compatibilityDshLatestOnly", { latest });
			return t("compatibilityDshUnknown");
		}
		function pluginVersionSummary(current, latest, t) {
			if (latest === void 0) return t("compatibilityPluginCurrentOnly", { current });
			return current === latest ? t("compatibilityPluginSame", { version: current }) : t("compatibilityPluginDifferent", {
				current,
				latest
			});
		}
		function compatibilityIssueUrl(currentVersion, latestPluginVersion, currentDshVersion, latestDshVersion) {
			const params = new URLSearchParams({
				title: `Support Codex Connect on DSH ${currentDshVersion}`,
				body: `The compatibility card could not find a verified Codex Connect release for DSH ${currentDshVersion}. Installed Codex Connect: ${currentVersion}. Latest published Codex Connect: ${latestPluginVersion}. Latest DSH version in the compatibility record: ${latestDshVersion ?? "unavailable"}. This reports a verification or adaptation gap; it does not claim that the installed combination is known to fail.`
			});
			return `${OPENAI_CODEX_REPOSITORY_URL}/issues/new?${params.toString()}`;
		}
		async function copyAgentPrompt(prompt) {
			try {
				if (navigator.clipboard?.writeText === void 0) return false;
				await navigator.clipboard.writeText(prompt);
				return true;
			} catch {
				return false;
			}
		}
		function safeReleaseUrl(value) {
			try {
				const url = new URL(value);
				return url.protocol === "https:" && url.hostname === "github.com" ? url.href : void 0;
			} catch {
				return;
			}
		}
		function renderInlineMarkdown(text, keyPrefix, t) {
			const tokens = /(?:\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^)\s]+\)|https:\/\/[^\s<]+)/gu;
			const children = [];
			let lastIndex = 0;
			let match;
			let tokenIndex = 0;
			while ((match = tokens.exec(text)) !== null) {
				if (match.index > lastIndex) children.push(text.slice(lastIndex, match.index));
				const token = match[0];
				const bold = /^\*\*([^*]+)\*\*$/u.exec(token);
				const markdownLink = /^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/u.exec(token);
				const bareUrl = /^https:\/\/[^\s<]+$/u.test(token) ? token.replace(/[.,]$/u, "") : void 0;
				if (bold !== null) children.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: bold[1] ?? "" }, `${keyPrefix}-bold-${tokenIndex}`));
				else if (markdownLink !== null) {
					const label = markdownLink[1] ?? token;
					const href = markdownLink[2] === void 0 ? void 0 : safeReleaseUrl(markdownLink[2]);
					children.push(href === void 0 ? label : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href,
						target: "_blank",
						rel: "noopener noreferrer",
						children: label
					}, `${keyPrefix}-link-${tokenIndex}`));
				} else if (bareUrl !== void 0) {
					const href = safeReleaseUrl(bareUrl);
					children.push(href === void 0 ? token : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href,
						target: "_blank",
						rel: "noopener noreferrer",
						children: t("viewGithubLink")
					}, `${keyPrefix}-url-${tokenIndex}`));
				} else children.push(token);
				lastIndex = match.index + token.length;
				tokenIndex += 1;
			}
			if (lastIndex < text.length) children.push(text.slice(lastIndex));
			return children;
		}
		function renderReleaseNotes(markdown, t) {
			const content = [];
			let bullets = [];
			const flushBullets = () => {
				if (bullets.length === 0) return;
				content.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
					style: notesListStyle,
					children: bullets
				}, `list-${content.length}`));
				bullets = [];
			};
			markdown.split("\n").forEach((line, index) => {
				const trimmed = line.trim();
				const bullet = /^[-*]\s+(.+)$/u.exec(trimmed);
				const heading = /^#{1,6}\s+(.+)$/u.exec(trimmed);
				const fullChangelog = /^\*\*(Full Changelog|完整变更日志)\*\*:\s*(https:\/\/\S+)$/iu.exec(trimmed);
				if (bullet !== null) bullets.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: renderInlineMarkdown(bullet[1] ?? "", `item-${index}`, t) }, `item-${index}`));
				else if (heading !== null) {
					flushBullets();
					const headingText = heading[1] ?? "";
					const displayHeading = /^what(?:'s| is)?\s+changed$/iu.test(headingText.trim()) ? t("technicalDetailsHeading") : headingText;
					content.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
						style: notesHeadingStyle,
						children: renderInlineMarkdown(displayHeading, `heading-${index}`, t)
					}, `heading-${index}`));
				} else if (fullChangelog !== null) {
					flushBullets();
					const href = fullChangelog[2] === void 0 ? void 0 : safeReleaseUrl(fullChangelog[2]);
					content.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							...bodyStyle$1,
							fontSize: 12,
							lineHeight: "19px"
						},
						children: href === void 0 ? t("viewFullChangelog") : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							href,
							target: "_blank",
							rel: "noopener noreferrer",
							children: t("viewFullChangelog")
						})
					}, `changelog-${index}`));
				} else if (trimmed !== "") {
					flushBullets();
					content.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							...bodyStyle$1,
							fontSize: 12,
							lineHeight: "19px"
						},
						children: renderInlineMarkdown(trimmed, `paragraph-${index}`, t)
					}, `paragraph-${index}`));
				} else flushBullets();
			});
			flushBullets();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				style: notesStyle,
				children: content
			});
		}
		function UpdateContents({ updater, t, overlay }) {
			const snapshot = (0, react.useSyncExternalStore)(updater.subscribe, updater.getSnapshot, updater.getSnapshot);
			const latestVersion = snapshot.latestVersion;
			const [technicalDetailsOpen, setTechnicalDetailsOpen] = (0, react.useState)(false);
			const [copied, setCopied] = (0, react.useState)(false);
			const [copyFailed, setCopyFailed] = (0, react.useState)(false);
			const [recheckRequested, setRecheckRequested] = (0, react.useState)(false);
			const compatibility = snapshot.compatibility;
			let compatibilityTitleKey = compatibility === void 0 ? void 0 : compatibilityTitleKeys[compatibility.status];
			let compatibilityBodyKey = compatibility === void 0 ? void 0 : compatibilityBodyKeys[compatibility.status];
			if (compatibility?.status === "compatible") {
				compatibilityTitleKey = "compatibilityCurrentTitle";
				compatibilityBodyKey = "compatibilityCurrentBody";
			} else if (compatibility?.status === "unverified" && snapshot.currentDshVersion === void 0) {
				compatibilityTitleKey = "compatibilityCurrentDshUnknownTitle";
				compatibilityBodyKey = "compatibilityCurrentDshUnknownBody";
			} else if (compatibility?.status === "unverified" && compatibility.latestDshVersion !== void 0 && snapshot.currentDshVersion !== void 0 && compareOpenAICodexVersions(snapshot.currentDshVersion, compatibility.latestDshVersion) > 0) {
				compatibilityTitleKey = "compatibilityCurrentDshNewerTitle";
				compatibilityBodyKey = "compatibilityCurrentDshNewerBody";
			}
			const compatibilityWarning = compatibility?.status === "plugin-update-required" || compatibility?.status === "dsh-update-required" || compatibility?.status === "not-yet-compatible";
			const noticeKey = latestVersion === void 0 ? void 0 : `${snapshot.currentVersion}:${latestVersion}:${snapshot.currentDshVersion ?? "unknown"}:${compatibility?.latestDshVersion ?? "unknown"}:${compatibility?.status ?? "none"}:${compatibility?.reportCompatibilityGap === true ? "report" : "no-report"}`;
			if (overlay && (!compatibilityWarning && snapshot.status !== "update-available" || noticeKey === void 0 || snapshot.dismissedNotice === noticeKey)) return null;
			const available = snapshot.status === "update-available";
			const technicalDetails = available && technicalDetailsOpen;
			const highlights = snapshot.highlights ?? [];
			const agentPrompt = t("agentUpgradePrompt", { repository: OPENAI_CODEX_REPOSITORY_URL });
			const copy = async () => {
				setCopyFailed(false);
				const ok = await copyAgentPrompt(agentPrompt);
				setCopied(ok);
				setCopyFailed(!ok);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: overlay ? {
					...panelStyle,
					...overlayStyle
				} : panelStyle,
				role: overlay ? "status" : "region",
				"aria-label": t("updateHeading"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle$1,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: titleStyle$1,
							children: compatibilityWarning ? t("updateHeading") : available ? t("newVersionAvailable", { version: snapshot.latestVersion }) : t("updateHeading")
						}), overlay ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle$2,
							"aria-label": t("dismissUpdate"),
							onClick: () => {
								if (noticeKey !== void 0) updater.dismiss(noticeKey);
							},
							children: t("dismissUpdate")
						}) : null]
					}),
					compatibility === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: compatibilityStyle,
						"data-compatibility-status": compatibility.status,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", {
								style: titleStyle$1,
								children: [
									compatibilityIcons[compatibility.status],
									" ",
									t(compatibilityTitleKey ?? compatibilityTitleKeys[compatibility.status])
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: bodyStyle$1,
								children: dshVersionSummary(snapshot.currentDshVersion, compatibility.latestDshVersion, t)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: bodyStyle$1,
								children: pluginVersionSummary(snapshot.currentVersion, compatibility.latestPluginVersion, t)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: bodyStyle$1,
								children: compatibility.status === "dsh-update-required" ? t("compatibilityDshUpdateBody", { latestDshVersion: compatibility.latestDshVersion ?? "" }) : t(compatibilityBodyKey ?? compatibilityBodyKeys[compatibility.status])
							}),
							compatibility.status === "dsh-update-required" && compatibility.latestDshVersion !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: `https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v${compatibility.latestDshVersion}`,
								target: "_blank",
								rel: "noopener noreferrer",
								style: textButtonStyle,
								children: t("compatibilityDshUpdateAction", { version: compatibility.latestDshVersion })
							}) : null,
							compatibility.reportCompatibilityGap === true && snapshot.currentDshVersion !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: compatibility.trackerUrl ?? compatibilityIssueUrl(snapshot.currentVersion, compatibility.latestPluginVersion, snapshot.currentDshVersion, compatibility.latestDshVersion),
								target: "_blank",
								rel: "noopener noreferrer",
								style: textButtonStyle,
								children: compatibility.trackerUrl === void 0 ? t("compatibilityReport") : t("compatibilityViewTracker")
							}) : null
						]
					}),
					snapshot.status === "idle" || snapshot.status === "checking" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle$1,
						children: t("checkingForUpdates")
					}) : snapshot.status === "up-to-date" ? recheckRequested ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle$1,
						children: t("upgradeCheckSuccess")
					}) : null : snapshot.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle$1,
						children: t("updateCheckUnavailable")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: versionSummaryStyle,
							children: snapshot.versionsBehind === void 0 ? t("versionsBehindUnknown") : t("versionsBehind", { count: snapshot.versionsBehind })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: highlightsStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								style: titleStyle$1,
								children: t("whatMatters")
							}), highlights.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: bodyStyle$1,
								children: t("noCuratedHighlights")
							}) : highlights.map((highlight) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [highlights.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								style: bodyStyle$1,
								children: highlight.version
							}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: bodyStyle$1,
								children: t(highlightKeys[highlight.kind])
							})] }, `${highlight.version}:${highlight.kind}`))]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: sectionStyle,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: titleStyle$1,
									children: t("upgradeStepsHeading")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: bodyStyle$1,
									children: t("agentUpgradeHelp")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: promptRowStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
										style: promptTextStyle,
										children: agentPrompt
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: buttonStyle$2,
										onClick: () => {
											copy();
										},
										children: copied ? t("agentPromptCopied") : t("copyForAgent")
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: bodyStyle$1,
									children: t("agentUpgradeFinish")
								}),
								copyFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: statusStyle$1,
									children: t("agentPromptCopyFailed")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: actionStyle,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: primaryButtonStyle$1,
										onClick: () => {
											setRecheckRequested(true);
											updater.refresh(true);
										},
										children: t("recheckAfterUpgrade")
									})
								}),
								recheckRequested && snapshot.status === "update-available" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: statusStyle$1,
									children: t("upgradeStillAvailable", { version: snapshot.currentVersion })
								}) : null
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: linkRowStyle,
							children: [snapshot.releaseUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								href: snapshot.releaseUrl,
								target: "_blank",
								rel: "noopener noreferrer",
								style: textButtonStyle,
								children: t("openReleasePage")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: textButtonStyle,
								"aria-expanded": technicalDetails,
								onClick: () => {
									setTechnicalDetailsOpen(!technicalDetailsOpen);
								},
								children: technicalDetails ? t("hideTechnicalDetails") : t("viewTechnicalDetails")
							})]
						}),
						technicalDetails ? snapshot.releaseNotes === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: bodyStyle$1,
							children: t("releaseNotesUnavailable")
						}) : renderReleaseNotes(snapshot.releaseNotes, t) : null
					] }),
					!overlay ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...rowStyle$1,
							justifyContent: "flex-end"
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle$2,
							disabled: snapshot.status === "checking",
							onClick: () => {
								updater.refresh(true);
							},
							children: snapshot.status === "checking" ? t("checkingForUpdates") : t("checkForUpdates")
						})
					}) : null
				]
			});
		}
		/** Persistent frame-wide update reminder registered in DSH's shell.overlay slot. */
		function OpenAICodexUpdateOverlay(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpdateContents, {
				...props,
				overlay: true
			});
		}
		/** Settings-page update information and manual check controls. */
		function OpenAICodexUpdateSettings(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UpdateContents, {
				...props,
				overlay: false
			});
		}
		//#endregion
		//#region src/client/OpenAICodexSettings.tsx
		/** Plugin-owned OpenAI Codex account controls used inside Plugin configuration. */
		const pageStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 18,
			maxWidth: 720
		};
		const titleStyle = {
			margin: 0,
			fontSize: 20,
			lineHeight: "28px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)"
		};
		const bodyStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "22px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const cardStyle$1 = {
			display: "flex",
			flexDirection: "column",
			gap: 14,
			padding: "18px 20px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 12,
			background: "var(--dsw-alias-bg-module-platform)"
		};
		const embeddedPageStyle = {
			...pageStyle,
			gap: 0,
			maxWidth: "none"
		};
		const embeddedCardStyle = {
			...cardStyle$1,
			padding: 0,
			border: 0,
			borderRadius: 0,
			background: "transparent"
		};
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 12
		};
		const statusStyle = {
			display: "flex",
			alignItems: "center",
			gap: 9,
			fontSize: 15,
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)"
		};
		const buttonStyle$1 = {
			boxSizing: "border-box",
			minHeight: 34,
			padding: "6px 14px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 18,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: 14,
			cursor: "pointer"
		};
		const primaryButtonStyle = {
			...buttonStyle$1,
			borderColor: "var(--dsw-alias-button-primary-fill)",
			background: "var(--dsw-alias-button-primary-fill)",
			color: "var(--dsw-alias-label-primary-foreground)"
		};
		const errorStyle$1 = {
			...bodyStyle,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const quotaListStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 18,
			paddingTop: 2
		};
		const quotaGroupStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 10
		};
		const quotaTitleStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "20px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)"
		};
		const quotaLabelStyle = {
			display: "flex",
			justifyContent: "space-between",
			gap: 12,
			fontSize: 13,
			lineHeight: "20px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const progressTrackStyle = {
			height: 8,
			overflow: "hidden",
			borderRadius: 999,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.08))"
		};
		const commandStyle = {
			margin: 0,
			padding: "10px 12px",
			overflowX: "auto",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))",
			color: "var(--dsw-alias-label-primary)",
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: 13,
			lineHeight: "20px",
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere"
		};
		const accountPanelStyle = {
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10
		};
		const accountRowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 12,
			padding: "12px 14px",
			borderTop: "1px solid var(--dsw-alias-border-l2)"
		};
		const accountIdentityStyle = {
			minWidth: 0,
			display: "flex",
			flexDirection: "column",
			gap: 2
		};
		const accountBadgeStyle = {
			display: "inline-flex",
			marginLeft: 7,
			padding: "1px 7px",
			borderRadius: 999,
			background: "var(--dsw-alias-state-success-secondary, rgba(34, 160, 107, 0.12))",
			color: "var(--dsw-alias-state-success-primary, #087a41)",
			fontSize: 11,
			lineHeight: "18px",
			fontWeight: 600
		};
		const dangerButtonStyle = {
			...buttonStyle$1,
			color: "var(--dsw-alias-state-error-primary, #d92d20)"
		};
		const moduleTabsStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
			gap: 8,
			paddingTop: 2
		};
		const moduleTabStyle = {
			...buttonStyle$1,
			minWidth: 0,
			minHeight: 54,
			borderRadius: 10,
			display: "flex",
			flexDirection: "column",
			alignItems: "flex-start",
			justifyContent: "center",
			gap: 2,
			overflowWrap: "anywhere"
		};
		const activeModuleTabStyle = {
			...moduleTabStyle,
			border: "1px solid var(--dsw-alias-button-primary-fill)",
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))"
		};
		const moduleSummaryStyle = {
			fontSize: 11,
			lineHeight: "16px",
			fontWeight: 400,
			color: "var(--dsw-alias-label-secondary)"
		};
		const SETTINGS_MODULES = [
			"account",
			"models",
			"network",
			"capabilities"
		];
		const UNAVAILABLE_CONFIG_SNAPSHOT = {
			status: "unavailable",
			value: void 0,
			base: void 0,
			user: void 0,
			revision: void 0,
			writable: false,
			mode: "memory"
		};
		function progressFillStyle(percent) {
			return {
				width: `${Math.max(0, Math.min(100, percent))}%`,
				height: "100%",
				borderRadius: "inherit",
				background: "var(--dsw-alias-brand-primary, #1677ff)"
			};
		}
		function windowLabel(seconds, t) {
			if (seconds === 18e3) return t("fiveHourLimit");
			if (seconds === 604800) return t("weeklyLimit");
			const hours = seconds / 3600;
			return Number.isInteger(hours) ? t("hourLimit", { count: hours }) : t("usageWindow");
		}
		function formatPercent$1(percent) {
			return new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(percent);
		}
		/** Format a server-declared Unix-second reset in the user's local timezone. */
		function formatOpenAICodexResetAt(resetAt) {
			if (resetAt === void 0 || !Number.isSafeInteger(resetAt) || resetAt <= 0) return void 0;
			const date = /* @__PURE__ */ new Date(resetAt * 1e3);
			if (!Number.isFinite(date.getTime())) return void 0;
			return new Intl.DateTimeFormat(void 0, {
				dateStyle: "medium",
				timeStyle: "short"
			}).format(date);
		}
		function QuotaBar({ label, percent, detail, t }) {
			const display = formatPercent$1(percent);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: quotaGroupStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: quotaLabelStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("percentRemaining", { percent: display }) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: progressTrackStyle,
						role: "progressbar",
						"aria-label": label,
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						"aria-valuenow": percent,
						"aria-valuetext": t("percentRemaining", { percent: display }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: progressFillStyle(percent) })
					}),
					detail === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: detail
					})
				]
			});
		}
		/** Quota rows shared by Models and Plugin settings. */
		function UsageLimits({ usage, quotaError, t, heading = true }) {
			const hasData = usage.rateLimits.length > 0 || usage.credits !== void 0 || usage.individualLimit !== void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: quotaListStyle,
				children: [
					heading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: quotaTitleStyle,
						children: t("usageLimits")
					}) : null,
					usage.rateLimits.map((limit) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: quotaGroupStyle,
						children: limit.windows.map((window) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBar, {
							label: `${limit.name ?? limit.id} · ${windowLabel(window.windowSeconds, t)}`,
							percent: window.remainingPercent,
							detail: t("resetAt", { time: formatOpenAICodexResetAt(window.resetAt) ?? t("resetUnavailable") }),
							t
						}, window.windowSeconds))
					}, limit.id)),
					usage.individualLimit === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBar, {
						label: t("monthlyLimit"),
						percent: usage.individualLimit.remainingPercent,
						detail: t("exactRemaining", {
							remaining: usage.individualLimit.remaining,
							limit: usage.individualLimit.limit
						}),
						t
					}),
					usage.credits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: quotaLabelStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("credits") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: usage.credits.unlimited ? t("unlimited") : usage.credits.balance === void 0 ? t("available") : usage.credits.balance })]
					}),
					!hasData && quotaError === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("quotaUnavailable")
					}) : null,
					quotaError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$1,
						children: t("quotaUnavailable")
					})
				]
			});
		}
		/** Account indicator colors shared by the compact row and expanded controls. */
		function dotStyle(status) {
			return {
				width: 9,
				height: 9,
				borderRadius: "50%",
				flex: "0 0 auto",
				background: status === "signed-in" ? "var(--dsw-alias-state-success-primary, #22a06b)" : status === "error" || status === "reauth-required" || status === "remote-web-origin-not-trusted" ? "var(--dsw-alias-state-error-primary, #d92d20)" : status === "signing-in" || status === "loading" ? "var(--dsw-alias-brand-primary, #1677ff)" : "var(--dsw-alias-label-dimmed, #9aa0a6)"
			};
		}
		/** Non-sensitive account state label for either settings presentation. */
		function accountStatusLabel(status, t) {
			return t({
				"signed-in": "signedIn",
				loading: "loadingAccount",
				"signing-in": "signingIn",
				"reauth-required": "reauthRequired",
				"remote-web-origin-not-trusted": "remoteOriginTitle",
				error: "requestFailed",
				"signed-out": "signedOut"
			}[status]);
		}
		/** Shared OAuth actions; Models uses shorter, task-oriented labels. */
		function AccountActions({ t, store, snapshot, compact = false }) {
			const { status, busy, operation } = snapshot;
			if (status.status === "loading" || status.status === "remote-web-origin-not-trusted") return null;
			if (operation.kind === "starting-authorization" || operation.kind === "waiting-authorization" || operation.kind === "cancelling-authorization" || status.status === "signing-in") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: buttonStyle$1,
					disabled: busy,
					onClick: () => {
						store.signIn();
					},
					children: busy ? t("working") : t(compact ? "continueAuthorization" : "reopenAuthorization")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: buttonStyle$1,
					disabled: busy,
					onClick: () => {
						store.cancel();
					},
					children: t("cancelSignIn")
				})]
			});
			if (status.status === "signed-in") return null;
			const action = status.status === "error" || status.status === "reauth-required" ? t(compact ? "reauthorize" : "loginAgain") : t(compact ? "authorize" : "login");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: primaryButtonStyle,
				disabled: busy,
				onClick: () => {
					store.signIn();
				},
				children: busy ? t("working") : action
			});
		}
		/** Saved-account summary and explicit account-management actions. */
		function AccountManager({ t, store, snapshot, quotaExpanded, quotaControlsId, onToggleQuota, compact = false }) {
			const accountsPanelId = (0, react.useId)();
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [removeKey, setRemoveKey] = (0, react.useState)();
			const { accounts, busy, operation, status } = snapshot;
			const active = accounts.find((account) => account.active);
			const removeAccount = accounts.find((account) => account.accountKey === removeKey);
			const replacement = removeAccount?.active === true ? accounts.find((account) => account.accountKey !== removeAccount.accountKey) : void 0;
			const authorizing = operation.kind === "starting-authorization" || operation.kind === "waiting-authorization" || operation.kind === "cancelling-authorization" || status.status === "signing-in";
			(0, react.useEffect)(() => {
				if (removeKey !== void 0 && !accounts.some((account) => account.accountKey === removeKey)) setRemoveKey(void 0);
			}, [accounts, removeKey]);
			if (accounts.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountActions, {
				t,
				store,
				snapshot,
				compact
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								minWidth: 0,
								gap: 10
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									width: 38,
									height: 38,
									borderRadius: "50%",
									display: "grid",
									placeItems: "center",
									flex: "0 0 auto",
									background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))",
									fontWeight: 600
								},
								children: (active?.displayName.trim()[0] ?? "C").toUpperCase()
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: accountIdentityStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: {
										overflow: "hidden",
										textOverflow: "ellipsis"
									},
									children: active?.displayName ?? t("accountHeading")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: bodyStyle,
									children: active?.maskedEmail === void 0 ? t("currentAccountDetail") : `${active.maskedEmail} · ${t("currentAccountDetail")}`
								})]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 8
							},
							children: [
								status.status === "reauth-required" && !authorizing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: primaryButtonStyle,
									disabled: busy,
									onClick: () => {
										store.signIn();
									},
									children: t("reauthorize")
								}) : null,
								authorizing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountActions, {
									t,
									store,
									snapshot,
									compact: true
								}) : null,
								onToggleQuota === void 0 || status.status !== "signed-in" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle$1,
									"aria-expanded": quotaExpanded,
									"aria-controls": quotaControlsId,
									onClick: onToggleQuota,
									children: t(quotaExpanded === true ? "hideQuota" : "viewQuota")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle$1,
									"aria-expanded": expanded,
									"aria-controls": accountsPanelId,
									onClick: () => {
										setExpanded(!expanded);
									},
									children: t(expanded ? "hideAccounts" : "manageAccounts")
								})
							]
						})]
					}),
					authorizing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("addingAccountKeepsCurrent")
					}) : null,
					expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						id: accountsPanelId,
						style: accountPanelStyle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...rowStyle,
									padding: "10px 14px",
									background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
									t("savedAccounts"),
									" · ",
									accounts.length
								] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: primaryButtonStyle,
									disabled: busy || authorizing,
									onClick: () => {
										store.signIn();
									},
									children: operation.kind === "starting-authorization" ? t("working") : t("addAccount")
								})]
							}),
							accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: accountRowStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: accountIdentityStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [account.displayName, account.active ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: accountBadgeStyle,
										children: t("currentAccount")
									}) : null] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: bodyStyle,
										children: account.maskedEmail === void 0 ? t(account.active ? "currentAccountDetail" : "savedAccountDetail") : `${account.maskedEmail} · ${t(account.active ? "currentAccountDetail" : "savedAccountDetail")}`
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "flex",
										flexWrap: "wrap",
										gap: 8
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: buttonStyle$1,
										disabled: busy || account.active,
										onClick: () => {
											store.activate(account.accountKey);
										},
										children: operation.kind === "activating" && operation.accountKey === account.accountKey ? t("working") : t(account.active ? "usingAccount" : "useAccount")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: dangerButtonStyle,
										disabled: busy,
										onClick: () => {
											setRemoveKey(account.accountKey);
										},
										children: t("removeAccount")
									})]
								})]
							}, account.accountKey)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...rowStyle,
									padding: "10px 14px",
									borderTop: "1px solid var(--dsw-alias-border-l2)"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: bodyStyle,
									children: t("activeAccountHelp")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: dangerButtonStyle,
									disabled: busy,
									onClick: () => {
										store.signOut();
									},
									children: operation.kind === "signing-out" ? t("working") : t("signOutAll")
								})]
							})
						]
					}) : null,
					removeAccount === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						role: "region",
						"aria-live": "polite",
						"aria-label": t("removeAccountTitle", { name: removeAccount.displayName }),
						style: {
							padding: 14,
							border: "1px solid var(--dsw-alias-state-error-primary, #d92d20)",
							borderRadius: 10
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("removeAccountTitle", { name: removeAccount.displayName }) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...bodyStyle,
									marginTop: 5
								},
								children: accounts.length === 1 ? t("removeLastAccountCopy") : replacement === void 0 ? t("removeAccountCopy") : t("removeActiveAccountCopy", { name: replacement.displayName })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...rowStyle,
									justifyContent: "flex-end"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle$1,
									onClick: () => {
										setRemoveKey(void 0);
									},
									children: t("cancel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: dangerButtonStyle,
									disabled: busy,
									onClick: () => {
										store.remove(removeAccount.accountKey, replacement?.accountKey);
									},
									children: operation.kind === "removing" ? t("working") : t("confirmRemove")
								})]
							})
						]
					})
				]
			});
		}
		/** Recovery links, errors and trusted-origin guidance in either account entry. */
		function AccountFeedback({ t, snapshot }) {
			const { status, loginUrl, operationError } = snapshot;
			const [copied, setCopied] = (0, react.useState)(false);
			const [copyFailed, setCopyFailed] = (0, react.useState)(false);
			const trustedOriginCommand = `dsh plugin --profile web exec dsh-codex-connect trust-origin ${window.location.origin}`;
			const copyTrustedOriginCommand = async () => {
				setCopyFailed(false);
				try {
					if (navigator.clipboard?.writeText === void 0) throw new Error("clipboard unavailable");
					await navigator.clipboard.writeText(trustedOriginCommand);
					setCopied(true);
				} catch {
					setCopyFailed(true);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				loginUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-start",
						gap: 10
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("authorizationHelp")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href: loginUrl,
						target: "_blank",
						rel: "noopener noreferrer",
						style: {
							...primaryButtonStyle,
							display: "inline-flex",
							alignItems: "center",
							textDecoration: "none"
						},
						children: t("openLoginInBrowser")
					})]
				}),
				status.status === "error" || status.status === "reauth-required" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: errorStyle$1,
					children: status.message
				}) : null,
				operationError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: errorStyle$1,
					children: operationError
				}),
				status.status === "remote-web-origin-not-trusted" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: errorStyle$1,
							children: t("remoteOriginDescription")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: bodyStyle,
							children: t("remoteOriginCommandHelp")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
							style: commandStyle,
							children: trustedOriginCommand
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: rowStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle$1,
								onClick: () => {
									copyTrustedOriginCommand();
								},
								children: copied ? t("remoteOriginCopied") : t("remoteOriginCopy")
							}), copyFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: errorStyle$1,
								children: t("remoteOriginCopyFailed")
							}) : null]
						})
					]
				}) : null
			] });
		}
		/** OpenAI Codex account status and OAuth actions. */
		function OpenAICodexSettings({ t, configScope, updater, account, embedded = false, accountOnly = false }) {
			if (t === void 0) throw new Error("OpenAI Codex settings requires its translation function");
			const [localAccount] = (0, react.useState)(() => new OpenAICodexAccountStore());
			const store = account ?? localAccount;
			const snapshot = (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot);
			const subscribeConfig = (0, react.useCallback)((listener) => configScope?.subscribe(listener) ?? (() => void 0), [configScope]);
			const getConfigSnapshot = (0, react.useCallback)(() => configScope?.getSnapshot() ?? UNAVAILABLE_CONFIG_SNAPSHOT, [configScope]);
			const configSnapshot = (0, react.useSyncExternalStore)(subscribeConfig, getConfigSnapshot, getConfigSnapshot);
			const { status } = snapshot;
			const titleId = (0, react.useId)();
			const [activeModule, setActiveModule] = (0, react.useState)("account");
			const panelIdPrefix = `${titleId}-module`;
			const label = accountStatusLabel(status.status, t);
			const moduleSummary = (module) => {
				if (module === "account") return t("accountModuleSummary", { status: label });
				const config = configSnapshot.value;
				if (module === "models") return config?.models === void 0 ? t("modelsModuleDefault") : t("modelsModuleSelected", { count: config.models.length });
				if (module === "network") return t(config?.enableProxy === true ? "networkModuleProxy" : "networkModuleDirect");
				return t("capabilitiesModuleEnabled", { count: config === void 0 ? 0 : [
					config.enableSearch,
					config.enableImageTool,
					config.enableImageGeneration,
					config.enableAutoReview
				].filter(Boolean).length });
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: embedded ? embeddedPageStyle : pageStyle,
				...embedded ? { "aria-label": t("title") } : { "aria-labelledby": titleId },
				children: [embedded ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					id: titleId,
					style: titleStyle,
					children: t("title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: {
						...bodyStyle,
						marginTop: 6
					},
					children: t("intro")
				})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: embedded ? embeddedCardStyle : cardStyle$1,
					children: [
						accountOnly || updater === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenAICodexUpdateSettings, {
							t,
							updater
						}),
						accountOnly ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: moduleTabsStyle,
							role: "tablist",
							"aria-label": t("settingsModules"),
							children: SETTINGS_MODULES.map((module, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								id: `${panelIdPrefix}-${module}-tab`,
								type: "button",
								role: "tab",
								"aria-label": t(`${module}Module`),
								"aria-selected": activeModule === module,
								"aria-controls": `${panelIdPrefix}-${module}`,
								tabIndex: activeModule === module ? 0 : -1,
								style: activeModule === module ? activeModuleTabStyle : moduleTabStyle,
								onClick: () => {
									setActiveModule(module);
								},
								onKeyDown: (event) => {
									if (![
										"ArrowLeft",
										"ArrowRight",
										"Home",
										"End"
									].includes(event.key)) return;
									event.preventDefault();
									const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? SETTINGS_MODULES.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + SETTINGS_MODULES.length) % SETTINGS_MODULES.length;
									const next = SETTINGS_MODULES[nextIndex];
									setActiveModule(next);
									document.getElementById(`${panelIdPrefix}-${next}-tab`)?.focus();
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(`${module}Module`) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: moduleSummaryStyle,
									children: moduleSummary(module)
								})]
							}, module))
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							id: `${panelIdPrefix}-account`,
							role: accountOnly ? void 0 : "tabpanel",
							"aria-labelledby": accountOnly ? void 0 : `${panelIdPrefix}-account-tab`,
							hidden: !accountOnly && activeModule !== "account",
							style: {
								display: accountOnly || activeModule === "account" ? "flex" : "none",
								flexDirection: "column",
								gap: 14
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
									style: quotaTitleStyle,
									children: t("accountHeading")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: rowStyle,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: statusStyle,
										role: "status",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											style: dotStyle(status.status)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountManager, {
									t,
									store,
									snapshot
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFeedback, {
									t,
									snapshot
								}),
								status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageLimits, {
									usage: status.usage,
									...status.quotaError === void 0 ? {} : { quotaError: status.quotaError },
									t
								}) : null,
								accountOnly ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: bodyStyle,
									children: t("modelsAccountHelp")
								}) : null
							]
						}),
						accountOnly ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenAICodexConfiguration, {
							t,
							activeModule,
							panelIdPrefix,
							...configScope === void 0 ? {} : { scope: configScope }
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/OpenAICodexPluginCard.tsx
		/** OpenAI Codex account card contributed to Harness Plugin configuration. */
		const cardStyle = {
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10
		};
		const headerStyle = {
			boxSizing: "border-box",
			width: "100%",
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 16,
			border: 0,
			padding: "13px 14px",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			textAlign: "left",
			cursor: "pointer"
		};
		const headTextStyle = {
			display: "flex",
			minWidth: 0,
			flexDirection: "column",
			gap: 3
		};
		const nameStyle = {
			fontSize: 14,
			lineHeight: "20px",
			fontWeight: 600
		};
		const descriptionStyle = {
			fontSize: 13,
			lineHeight: "18px",
			color: "var(--dsw-alias-label-tertiary)"
		};
		const chevronStyle = {
			flex: "0 0 auto",
			color: "var(--dsw-alias-label-tertiary)",
			transition: "transform 160ms ease"
		};
		const cardBodyStyle = {
			borderTop: "1px solid var(--dsw-alias-border-l2)",
			padding: "16px 14px 18px"
		};
		/** The same 14px outline glyph used by DSH's native PluginCard. */
		function NativeChevronDown({ open }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"aria-hidden": "true",
				style: {
					...chevronStyle,
					transform: open ? "rotate(180deg)" : "none"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
					width: "14",
					height: "14",
					viewBox: "0 0 14 14",
					fill: "none",
					xmlns: "http://www.w3.org/2000/svg",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
						fill: "currentColor"
					})
				})
			});
		}
		/** Render account management as one expandable Plugin configuration card. */
		function OpenAICodexPluginCard({ t, configScope, updater, account }) {
			if (t === void 0) throw new Error("OpenAI Codex plugin card requires its translation function");
			const [open, setOpen] = (0, react.useState)(false);
			const title = t("title");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: {
					...cardStyle,
					background: `var(--dsw-alias-bg-layer-${open ? "2" : "3"})`
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					style: headerStyle,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: headTextStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: nameStyle,
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: descriptionStyle,
							children: t("intro")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NativeChevronDown, { open })]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: cardBodyStyle,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenAICodexSettings, {
						t,
						...account === void 0 ? {} : { account },
						...updater === void 0 ? {} : { updater },
						embedded: true,
						...configScope === void 0 ? {} : { configScope }
					})
				}) : null]
			});
		}
		//#endregion
		//#region src/client/OpenAICodexQuotaIndicator.tsx
		/** Compact server-driven Codex quota indicator for the Composer tool row. */
		const WEEK_SECONDS = 604800;
		const FIVE_HOUR_SECONDS = 18e3;
		const USAGE_POLL_INTERVAL_MS = 6e4;
		const CODEX_PROVIDER$1 = "openai-codex";
		const SPARK_MODEL = "gpt-5.3-codex-spark";
		const SPARK_QUOTA_ID = "codex_bengalfox";
		function isRecord$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function isWindow(value) {
			if (!isRecord$1(value)) return false;
			const remainingPercent = value["remainingPercent"];
			const windowSeconds = value["windowSeconds"];
			const resetAt = value["resetAt"];
			return typeof remainingPercent === "number" && Number.isFinite(remainingPercent) && remainingPercent >= 0 && remainingPercent <= 100 && typeof windowSeconds === "number" && Number.isSafeInteger(windowSeconds) && windowSeconds > 0 && (resetAt === void 0 || typeof resetAt === "number" && Number.isSafeInteger(resetAt) && resetAt > 0 && Number.isFinite((/* @__PURE__ */ new Date(resetAt * 1e3)).getTime()));
		}
		function usageFromStatus(value) {
			if (!isRecord$1(value) || value["status"] !== "signed-in") return void 0;
			const usage = value["usage"];
			if (!isRecord$1(usage) || !Array.isArray(usage["rateLimits"])) return void 0;
			const rateLimits = usage["rateLimits"];
			for (const limit of rateLimits) {
				if (!isRecord$1(limit) || typeof limit["id"] !== "string" || !Array.isArray(limit["windows"])) return void 0;
				if (!limit["windows"].every(isWindow)) return void 0;
			}
			return usage;
		}
		function quotaOf(usage, model, windowSeconds) {
			const quotaId = model === SPARK_MODEL ? SPARK_QUOTA_ID : "codex";
			return usage.rateLimits.find((limit) => limit.id === quotaId)?.windows.find((window) => window.windowSeconds === windowSeconds);
		}
		function isGptModel(state) {
			const current = state.current;
			return state.status === "ready" && current?.provider === CODEX_PROVIDER$1 && typeof current.model === "string" && current.model.toLowerCase().startsWith("gpt-");
		}
		function formatPercent(percent) {
			return new Intl.NumberFormat(void 0, { maximumFractionDigits: 1 }).format(percent);
		}
		const QUOTA_PROGRESS_WIDTH_PX = 48;
		const QUOTA_PROGRESS_TRACK_HEIGHT_PX = 6;
		function boundedQuotaPercent(remainingPercent) {
			return Math.min(100, Math.max(0, remainingPercent));
		}
		function quotaProgressColor(remainingPercent) {
			const bounded = boundedQuotaPercent(remainingPercent);
			if (bounded >= 60) return {
				name: "green",
				value: "var(--dsw-alias-state-success-primary, #22c55e)"
			};
			if (bounded >= 40) return {
				name: "yellow",
				value: "var(--dsw-alias-state-warn-primary, #eab308)"
			};
			if (bounded >= 20) return {
				name: "orange",
				value: "#f97316"
			};
			return {
				name: "red",
				value: "var(--dsw-alias-state-error-primary, #ef4444)"
			};
		}
		function subscribeDirectory$1(directory, listener) {
			return directory.subscribe(listener);
		}
		/** Render the recognized quota windows returned for the current model bucket. */
		function OpenAICodexQuotaIndicator({ directory, t }) {
			const directoryState = (0, react.useSyncExternalStore)((listener) => subscribeDirectory$1(directory, listener), () => directory.getSnapshot(), () => directory.getSnapshot());
			const eligible = isGptModel(directoryState);
			const [request, setRequest] = (0, react.useState)({ status: "loading" });
			const [isHovered, setIsHovered] = (0, react.useState)(false);
			const [isFocused, setIsFocused] = (0, react.useState)(false);
			const tooltipId = (0, react.useId)();
			(0, react.useEffect)(() => {
				if (!eligible) {
					setRequest({ status: "hidden" });
					return;
				}
				const controller = new AbortController();
				let inFlight = false;
				let disposed = false;
				const refresh = async () => {
					if (inFlight || disposed) return;
					inFlight = true;
					try {
						const response = await fetch(OPENAI_CODEX_AUTH_STATUS_PATH, {
							method: "GET",
							credentials: "same-origin",
							headers: { accept: "application/json" },
							signal: controller.signal
						});
						const value = await response.json().catch(() => void 0);
						const usage = response.ok ? usageFromStatus(value) : void 0;
						if (!disposed && !controller.signal.aborted) setRequest(usage === void 0 ? { status: "hidden" } : {
							status: "ready",
							usage
						});
					} catch {
						if (!disposed && !controller.signal.aborted) setRequest({ status: "hidden" });
					} finally {
						inFlight = false;
					}
				};
				setRequest({ status: "loading" });
				refresh();
				const timer = window.setInterval(() => {
					refresh();
				}, USAGE_POLL_INTERVAL_MS);
				return () => {
					disposed = true;
					window.clearInterval(timer);
					controller.abort();
				};
			}, [eligible]);
			if (!eligible || request.status !== "ready" || request.usage === void 0) return null;
			const model = directoryState.current?.model;
			const fiveHour = quotaOf(request.usage, model, FIVE_HOUR_SECONDS);
			const weekly = quotaOf(request.usage, model, WEEK_SECONDS);
			const quotas = [...fiveHour === void 0 ? [] : [{
				kind: "five-hour",
				shortLabel: t("composerFiveHourShort"),
				summary: t("composerFiveHourQuotaSummary", {
					percent: formatPercent(fiveHour.remainingPercent),
					time: formatOpenAICodexResetAt(fiveHour.resetAt) ?? t("resetUnavailable")
				}),
				window: fiveHour
			}], ...weekly === void 0 ? [] : [{
				kind: "weekly",
				shortLabel: t("composerWeeklyShort"),
				summary: t("composerWeeklyQuotaSummary", {
					percent: formatPercent(weekly.remainingPercent),
					time: formatOpenAICodexResetAt(weekly.resetAt) ?? t("resetUnavailable")
				}),
				window: weekly
			}]];
			if (quotas.length === 0) return null;
			const summary = quotas.map((quota) => quota.summary).join("; ");
			const tooltipVisible = isHovered || isFocused;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				role: "status",
				"data-openai-codex-quota": quotas.map((quota) => quota.kind).join(","),
				"aria-label": summary,
				"aria-describedby": tooltipVisible ? tooltipId : void 0,
				tabIndex: 0,
				onMouseEnter: () => {
					setIsHovered(true);
				},
				onMouseLeave: () => {
					setIsHovered(false);
				},
				onFocus: () => {
					setIsFocused(true);
				},
				onBlur: () => {
					setIsFocused(false);
				},
				style: {
					display: "inline-flex",
					width: `70px`,
					minHeight: "28px",
					position: "relative",
					alignItems: "center",
					justifyContent: "center",
					flexDirection: "column",
					gap: "3px"
				},
				children: [quotas.map((quota) => {
					const progressColor = quotaProgressColor(quota.window.remainingPercent);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						"aria-hidden": "true",
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: 4
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: {
								width: 18,
								color: "var(--dsw-alias-label-tertiary)",
								fontSize: 9,
								lineHeight: "10px",
								textAlign: "right"
							},
							children: quota.shortLabel
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"data-openai-codex-quota-track": quota.kind,
							style: {
								display: "block",
								width: `${QUOTA_PROGRESS_WIDTH_PX}px`,
								height: `${QUOTA_PROGRESS_TRACK_HEIGHT_PX}px`,
								borderRadius: "999px",
								backgroundColor: "var(--dsw-alias-border-l2)",
								overflow: "hidden"
							},
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"data-openai-codex-quota-progress": quota.kind,
								"data-openai-codex-quota-color": progressColor.name,
								style: {
									display: "block",
									width: `${boundedQuotaPercent(quota.window.remainingPercent)}%`,
									height: "100%",
									borderRadius: "inherit",
									backgroundColor: progressColor.value
								}
							})
						})]
					}, quota.kind);
				}), tooltipVisible ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					id: tooltipId,
					role: "tooltip",
					"data-openai-codex-quota-tooltip": quotas.map((quota) => quota.kind).join(","),
					style: {
						position: "absolute",
						bottom: "calc(100% + 6px)",
						left: "50%",
						transform: "translateX(-50%)",
						zIndex: 1e3,
						whiteSpace: "nowrap",
						pointerEvents: "none",
						padding: "4px 8px",
						borderRadius: "6px",
						backgroundColor: "var(--dsw-specific-tip, #1f2329)",
						color: "var(--dsw-alias-label-primary, #ffffff)",
						boxShadow: "var(--dsw-shadow-lv2, 0 4px 12px rgb(0 0 0 / 12%))",
						fontSize: "12px",
						lineHeight: "18px"
					},
					children: summary
				}) : null]
			});
		}
		//#endregion
		//#region src/fast-mode-paths.ts
		/** Node-free Fast Mode route constants shared by Host and browser halves. */
		/** GET/POST endpoint for one conversation's process-local Fast Mode state. */
		const OPENAI_CODEX_FAST_MODE_PATH = "/plugins/dsh-openai-codex/fast-mode";
		//#endregion
		//#region src/client/OpenAICodexFastModeToggle.tsx
		/** Per-conversation OpenAI Codex Fast Mode control for the Composer row. */
		const CODEX_PROVIDER = "openai-codex";
		const FAST_MODE_ACTIVE_COLOR = "#f97316";
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function readEnabled(value) {
			if (!isRecord(value) || typeof value["enabled"] !== "boolean") return void 0;
			return value["enabled"];
		}
		function isEligible(state) {
			const current = state.current;
			return state.status === "ready" && current?.provider === CODEX_PROVIDER && typeof current.model === "string" && current.model.startsWith("gpt-");
		}
		function subscribeDirectory(directory, listener) {
			return directory.subscribe(listener);
		}
		function requestUrl(sessionId) {
			return `${OPENAI_CODEX_FAST_MODE_PATH}?sessionId=${encodeURIComponent(sessionId)}`;
		}
		/**
		* Render a real SVG lightning button only for GPT models on the exact Codex
		* provider.  Host state is read and written through the session-addressed
		* route; no global model slot or persistent settings are changed.
		*/
		function OpenAICodexFastModeToggle({ directory, sessionId, t }) {
			const eligible = isEligible((0, react.useSyncExternalStore)((listener) => subscribeDirectory(directory, listener), () => directory.getSnapshot(), () => directory.getSnapshot()));
			const [state, setState] = (0, react.useState)({
				status: "loading",
				enabled: false
			});
			const [tooltipVisible, setTooltipVisible] = (0, react.useState)(false);
			const controllerRef = (0, react.useRef)(void 0);
			const tooltipId = (0, react.useId)();
			(0, react.useEffect)(() => () => {
				controllerRef.current?.abort();
			}, []);
			(0, react.useEffect)(() => {
				controllerRef.current?.abort();
				controllerRef.current = void 0;
				if (!eligible) {
					setState({
						status: "loading",
						enabled: false
					});
					return;
				}
				const controller = new AbortController();
				controllerRef.current = controller;
				let disposed = false;
				setState({
					status: "loading",
					enabled: false
				});
				(async () => {
					try {
						const response = await fetch(requestUrl(sessionId), {
							method: "GET",
							credentials: "same-origin",
							headers: { accept: "application/json" },
							signal: controller.signal
						});
						const enabled = response.ok ? readEnabled(await response.json().catch(() => void 0)) : void 0;
						if (!disposed && !controller.signal.aborted) setState(enabled === void 0 ? {
							status: "error",
							enabled: false
						} : {
							status: "ready",
							enabled
						});
					} catch {
						if (!disposed && !controller.signal.aborted) setState({
							status: "error",
							enabled: false
						});
					} finally {
						if (controllerRef.current === controller) controllerRef.current = void 0;
					}
				})();
				return () => {
					disposed = true;
					controller.abort();
					if (controllerRef.current === controller) controllerRef.current = void 0;
				};
			}, [eligible, sessionId]);
			if (!eligible) return null;
			const busy = state.status !== "ready";
			const title = state.status === "loading" ? t("fastModeLoadingTitle") : state.status === "error" ? t("fastModeUnavailableTitle") : state.enabled ? t("fastModeEnabledTitle") : t("fastModeDisabledTitle");
			const toggle = () => {
				if (state.status !== "ready" || busy) return;
				controllerRef.current?.abort();
				const controller = new AbortController();
				controllerRef.current = controller;
				const next = !state.enabled;
				setState((current) => ({
					...current,
					status: "loading"
				}));
				(async () => {
					try {
						const response = await fetch(OPENAI_CODEX_FAST_MODE_PATH, {
							method: "POST",
							credentials: "same-origin",
							headers: {
								accept: "application/json",
								"content-type": "application/json"
							},
							body: JSON.stringify({
								sessionId,
								enabled: next
							}),
							signal: controller.signal
						});
						const enabled = response.ok ? readEnabled(await response.json().catch(() => void 0)) : void 0;
						if (!controller.signal.aborted) setState(enabled === void 0 ? {
							status: "error",
							enabled: state.enabled
						} : {
							status: "ready",
							enabled
						});
					} catch {
						if (!controller.signal.aborted) setState({
							status: "error",
							enabled: state.enabled
						});
					} finally {
						if (controllerRef.current === controller) controllerRef.current = void 0;
					}
				})();
			};
			const active = state.enabled;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				onMouseEnter: () => {
					setTooltipVisible(true);
				},
				onMouseLeave: () => {
					setTooltipVisible(false);
				},
				onFocus: () => {
					setTooltipVisible(true);
				},
				onBlur: () => {
					setTooltipVisible(false);
				},
				style: {
					display: "inline-flex",
					position: "relative",
					width: 30,
					height: 30
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"data-openai-codex-fast-mode": active ? "on" : "off",
					"aria-label": title,
					"aria-describedby": tooltipVisible ? tooltipId : void 0,
					"aria-pressed": active,
					"aria-busy": busy,
					disabled: busy,
					onClick: toggle,
					style: {
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 30,
						height: 30,
						padding: 0,
						border: 0,
						borderRadius: 8,
						background: "transparent",
						color: active ? FAST_MODE_ACTIVE_COLOR : "var(--dsw-alias-label-secondary)",
						cursor: busy ? "default" : "pointer",
						opacity: busy ? .6 : 1
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "16",
						height: "16",
						viewBox: "0 0 24 24",
						"aria-hidden": "true",
						focusable: "false",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							"data-openai-codex-fast-mode-bolt": active ? "filled" : "outline",
							d: "M13.1 2.75 5.35 13.1h5.8l-.95 8.15 8.45-11.2h-5.9l.35-7.3Z",
							fill: active ? "currentColor" : "none",
							stroke: "currentColor",
							strokeWidth: "1.8",
							strokeLinejoin: "round"
						})
					})
				}), tooltipVisible && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					id: tooltipId,
					role: "tooltip",
					style: {
						position: "absolute",
						left: "50%",
						bottom: "calc(100% + 8px)",
						zIndex: 1e3,
						transform: "translateX(-50%)",
						padding: "4px 8px",
						borderRadius: 6,
						background: "var(--dsw-specific-tip, #1f2329)",
						boxShadow: "var(--dsw-shadow-lv2)",
						color: "var(--dsw-alias-label-primary, #fff)",
						fontSize: 12,
						lineHeight: "18px",
						whiteSpace: "nowrap",
						pointerEvents: "none"
					},
					children: title
				})]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** English copy for the OpenAI Codex Plugin configuration card. */
		const en = {
			title: "Codex Connect",
			modelsProviderName: "Openai-Codex",
			modelsProviderSupport: "Powered by the Codex Connect plugin.",
			intro: "Use your ChatGPT subscription in dsh, with optional GPT Image generation and no API key.",
			accountHeading: "ChatGPT account",
			manageAccount: "Manage",
			manageAccounts: "Manage accounts",
			hideAccounts: "Hide accounts",
			addAccount: "Add account",
			savedAccounts: "Saved accounts",
			currentAccount: "Current",
			currentAccountDetail: "Current account",
			savedAccountDetail: "Saved account",
			useAccount: "Use this account",
			usingAccount: "In use",
			removeAccount: "Remove",
			signOutAll: "Sign out all accounts",
			activeAccountHelp: "Account changes apply to new Codex requests. Running requests are not changed.",
			addingAccountKeepsCurrent: "Browser authorization is still pending. The current account remains selected for new requests.",
			removeAccountTitle: "Remove “{name}”?",
			removeAccountCopy: "Its local authorization credential will be deleted. Other accounts are not signed out.",
			removeActiveAccountCopy: "Its local authorization credential will be deleted and “{name}” will become the current account.",
			removeLastAccountCopy: "This is the last saved account. Removing it signs Codex Connect out.",
			cancel: "Cancel",
			confirmRemove: "Confirm removal",
			authorize: "Authorize",
			continueAuthorization: "Continue authorization",
			reauthorize: "Reauthorize",
			viewQuota: "View quota",
			hideQuota: "Hide quota",
			moreSettings: "More settings",
			moreSettingsTitle: "Codex Connect settings",
			closeSettings: "Close",
			settingsSaveHint: "Save applies changes to both settings entries. Closing discards unsaved changes.",
			reopenAuthorization: "Reopen authorization",
			cancelSignIn: "Cancel sign-in",
			authorizationHelp: "You can reopen the authorization page or cancel and start again. Cancelling does not sign out an existing account.",
			modelsAccountHelp: "Proxy, model visibility, search and image options remain in Settings → Plugins → Codex Connect, or open them here:",
			expand: "Expand settings",
			collapse: "Collapse settings",
			loadingAccount: "Loading account…",
			signedOut: "Not signed in",
			signingIn: "Waiting for browser authorization…",
			signedIn: "Signed in",
			reauthRequired: "Sign in again",
			login: "Sign in with ChatGPT",
			loginAgain: "Sign in again",
			logout: "Sign out",
			working: "Working…",
			retry: "Retry",
			popupBlocked: "The browser blocked the sign-in window. Allow pop-ups for this dsh page and retry.",
			popupBlockedFallback: "The sign-in window could not be opened automatically. Use the link below to continue in your browser.",
			openLoginInBrowser: "Open ChatGPT sign-in page",
			usageLimits: "Usage limits",
			fiveHourLimit: "5-hour limit",
			weeklyLimit: "Weekly limit",
			hourLimit: "{count}-hour limit",
			usageWindow: "Usage window",
			percentRemaining: "{percent}% remaining",
			resetAt: "Resets {time}",
			resetUnavailable: "Reset time unavailable",
			composerWeeklyQuota: "Codex weekly quota",
			composerFiveHourShort: "5h",
			composerWeeklyShort: "7d",
			composerFiveHourQuotaSummary: "Codex 5-hour quota: {percent}% remaining; resets {time}",
			composerWeeklyQuotaSummary: "Codex weekly quota: {percent}% remaining; resets {time}",
			fastModeEnabledTitle: "Current: 1.5× speed, with faster quota consumption. Click to switch to Standard speed.",
			fastModeDisabledTitle: "Current: Standard speed. Click to enable 1.5× speed.",
			fastModeLoadingTitle: "Fast Mode state is loading for this conversation.",
			fastModeUnavailableTitle: "Fast Mode is unavailable for this conversation.",
			monthlyLimit: "Monthly credit limit",
			exactRemaining: "{remaining} of {limit} credits remaining",
			credits: "Credits",
			unlimited: "Unlimited",
			available: "Available",
			quotaUnavailable: "Usage limits are temporarily unavailable.",
			requestFailed: "The OpenAI Codex account request failed.",
			remoteOriginTitle: "Remote browser origin is not trusted",
			remoteOriginDescription: "Codex Connect accepts browser OAuth requests only from trusted local pages or origins explicitly approved by the device owner.",
			remoteOriginCommandHelp: "Run this command manually on the device that runs DSH, then reload this page. This page never runs it:",
			remoteOriginCopy: "Copy trust command",
			remoteOriginCopied: "Copied",
			remoteOriginCopyFailed: "Copy was unavailable. Copy the command manually.",
			configurationHeading: "Codex Connect configuration",
			settingsModules: "Settings modules",
			accountModule: "Account & quota",
			accountModuleSummary: "Status: {status}",
			modelsModule: "Models",
			networkModule: "Network",
			capabilitiesModule: "Capabilities",
			modelsModuleDefault: "All catalog models",
			modelsModuleSelected: "{count} model(s) shown",
			networkModuleDirect: "Direct connection",
			networkModuleProxy: "Proxy enabled",
			capabilitiesModuleEnabled: "{count} enabled",
			modelCatalog: "Models shown in the selector",
			modelCatalogIntro: "Choose which Codex models appear in model selectors. Existing conversations can continue using a hidden model.",
			modelCatalogLoading: "Loading available models…",
			modelCatalogFailed: "Available models could not be loaded.",
			modelContext: "Context",
			contextDefault: "Catalog default",
			contextCustom: "Custom",
			contextAdjust: "Adjust",
			contextHide: "Hide adjustment",
			contextTokens: "Context length",
			contextReset: "Restore default",
			contextSlider: "Adjust context budget",
			contextMaximum: "Configuration limit",
			contextLimitSource: "Source: official Codex configuration catalog (2026-09-05)",
			contextLimitFallback: "No higher configuration limit confirmed; capped at the installed catalog default.",
			contextAboveDefault: "Above the catalog default: larger requests may consume more quota or be rejected by your account or route. This plugin has not capacity-tested this range.",
			contextWarning: "Context overrides change client budgeting, not server capacity. An excessive value can cause requests to fail. Hiding a model keeps its budget. Changes apply after Save.",
			contextInvalid: "Enter a whole-number budget within the model’s configuration range, or choose Restore default.",
			capabilitiesHeading: "Optional capabilities",
			capabilitiesIntro: "Choose which extra Codex capabilities this dsh profile may register.",
			networkHeading: "Network connection",
			networkIntro: "Codex Connect uses a direct connection by default. When needed, detect a local proxy or enter one manually.",
			currentConnection: "Current connection",
			proxyEnabled: "Proxy enabled",
			directConnection: "Direct connection",
			directConnectionDescription: "Codex Connect does not use a dedicated proxy.",
			checkCurrentConnection: "Check current connection",
			checkingCurrentConnectionButton: "Checking…",
			checkingCurrentConnection: "Checking the saved proxy…",
			currentConnectionHealthy: "Connection is available.",
			currentConnectionFailed: "The saved proxy could not reach the Codex endpoint.",
			changeConnection: "Change connection",
			proxyConfigurationMethod: "Proxy configuration method",
			automaticDetection: "Automatic detection",
			manualEntry: "Manual entry",
			automaticDetectionHelp: "Checks common local proxy ports and environment variables without changing the saved connection.",
			scanLocalProxy: "Scan local proxies",
			manualProxyHelp: "Enter an HTTP(S) proxy address without credentials, a path, query, or fragment.",
			proxyCandidateHealthy: "Connection available",
			currentProxy: "Currently used",
			selectedProxy: "Selected",
			proxyDetectionFailedTitle: "No available proxy found",
			pendingProxy: "After saving, Codex Connect will use {proxyUrl}.",
			pendingDirect: "After saving, Codex Connect will stop using the proxy and connect directly.",
			customProxyActive: "Custom proxy selected: {proxyUrl}",
			detectProxy: "Detect proxy",
			detectingProxy: "Detecting…",
			configureProxyManually: "Configure manually",
			disableProxy: "Disable proxy",
			proxyCandidatesFound: "Working proxy candidates found. Choose one to stage it for activation.",
			keepDirectConnection: "Keep direct connection",
			useThisProxy: "Use this proxy",
			proxyDetectionFailed: "No working proxy candidate was found. Check DNS, connection refused, timeout, TLS, or proxy authentication errors, then try again.",
			proxyAddress: "Custom proxy address",
			testProxy: "Test proxy",
			testingProxy: "Testing…",
			proxyTestSucceeded: "Proxy reached the Codex endpoint (HTTP {status}).",
			proxyTestFailed: "Proxy test failed: {reason}.",
			proxyTestRequired: "Test this exact proxy address successfully before activation.",
			invalidProxyUrl: "Enter an HTTP(S) proxy origin without credentials or a path.",
			enableSearch: "Enable Codex search provider",
			enableSearchHelp: "Makes OpenAI Codex available and selects it for profile-wide web search while enabled.",
			searchModel: "Search model",
			searchMode: "Web access",
			modeCached: "Cached",
			modeIndexed: "Indexed",
			modeLive: "Live web",
			searchContextSize: "Search context",
			contextLow: "Low",
			contextMedium: "Medium",
			contextHigh: "High",
			searchMaxOutputTokens: "Maximum search output tokens",
			enableImageTool: "Enable view_image tool",
			enableImageToolHelp: "Allows approved local reads and public-network image fetches for vision-capable models.",
			enableImageGeneration: "Enable GPT Image generation",
			enableImageGenerationHelp: "Let GPT models use GPT Image to generate images in conversations.",
			enableAutoReview: "Codex Auto-review (Approve for me)",
			enableAutoReviewHelp: "Send eligible approval requests from OpenAI-Codex sessions to a separate Codex reviewer. This changes who reviews; it does not expand DSH file, network, or tool permissions.",
			autoReviewOfficialBadge: "Official Codex capability",
			autoReviewDetails: "What is sent and how failures are handled",
			autoReviewDisclosure: "Review requests send recent conversation text, relevant tool calls and results, tool arguments, the working directory, and the planned action to chatgpt.com. Hidden reasoning and stored credentials are not sent.",
			autoReviewFailureDisclosure: "If the reviewer cannot complete, DSH keeps human approval. An explicit denial blocks the action.",
			autoReviewOfficialDocs: "OpenAI Auto-review documentation",
			autoReviewConfirmTitle: "Enable Codex Auto-review?",
			autoReviewCancel: "Cancel",
			autoReviewConfirm: "Confirm",
			generating: "Generating image",
			generatingDetail: "Image generation is in progress. Stopping cancels the current turn.",
			cancelGeneration: "Stop this turn",
			cancelingGeneration: "Stopping…",
			promptLabel: "Prompt used for image generation",
			copyPrompt: "Copy prompt",
			promptCopied: "Copied",
			promptCopyFailed: "Copy unavailable",
			completed: "Image generated",
			retryGeneration: "Try again",
			regenerate: "Generate another",
			editImage: "Modify this image",
			retryRequest: "Retry the previous image generation.",
			regenerateRequest: "Generate another image with the previous image prompt unchanged.",
			editRequest: "Continue from the previous image. Ask me what I want to change before generating a new image.",
			actionSending: "Sending…",
			actionFailed: "The follow-up request could not be sent.",
			failed: "Image generation failed",
			canceled: "Image generation canceled",
			canceledDetail: "Local waiting stopped. The request may still be processing.",
			unknownResult: "The image result could not be displayed safely.",
			imageDetails: "Image details",
			imageDetail: "{name}: {format} · {width} × {height} · {size}",
			originalImageDetail: "Original {name}: {format} · {width} × {height} · {size}",
			previewImageDetail: "Conversation preview: {format} · {width} × {height} · {size}",
			download: "Download",
			downloadNamed: "Download {name}",
			downloadOriginal: "Download original",
			downloadOriginalNamed: "Download original {name}",
			downloadPreview: "Download preview",
			downloadPreviewNamed: "Download preview {name}",
			downloading: "Downloading…",
			downloadFailed: "Download failed. Retry",
			image: "Generated image",
			open: "Open image preview",
			openNamed: "Open {name}",
			loading: "Loading image",
			loadFailed: "Image could not be loaded. Retry",
			lightboxDialog: "Image preview",
			lightboxClose: "Close image preview",
			lightboxZoomIn: "Zoom in",
			lightboxZoomOut: "Zoom out",
			lightboxReset: "Fit image",
			routingNote: "These settings never change the default model. Codex Search temporarily owns the profile-wide search route while enabled.",
			settingsLoading: "Loading plugin settings…",
			settingsUnavailable: "Plugin settings are unavailable in this dsh profile.",
			settingsReadOnly: "This profile exposes plugin settings as read-only.",
			invalidSearchModel: "Enter a search model.",
			invalidSearchTokens: "Maximum search output tokens must be a positive whole number.",
			save: "Save changes",
			saving: "Saving…",
			discard: "Discard",
			settingsSaved: "Saved",
			settingsSaveFailed: "The settings could not be saved. Your unsaved changes are still available; retry or discard them.",
			updateHeading: "Updates and compatibility",
			compatibilityCompatibleTitle: "You can update DSH",
			compatibilityCompatibleBody: "This Codex Connect version has been verified with the latest DSH version shown here.",
			compatibilityCurrentTitle: "Current combination verified",
			compatibilityCurrentBody: "This installed DSH and Codex Connect combination has been verified.",
			compatibilityCurrentDshUnknownTitle: "Current DSH version unavailable",
			compatibilityCurrentDshUnknownBody: "The latest DSH compatibility record is available, but this running DSH version could not be detected.",
			compatibilityCurrentDshNewerTitle: "Current DSH is newer than the record",
			compatibilityCurrentDshNewerBody: "Compatibility has not been confirmed for this running DSH version yet.",
			compatibilityPluginUpdateTitle: "Update Codex Connect first",
			compatibilityPluginUpdateBody: "Your installed plugin is not verified with this DSH version, but the latest plugin is. Update the plugin before DSH.",
			compatibilityDshUpdateTitle: "Current combination is not verified; update DSH",
			compatibilityDshUpdateBody: "This exact Codex Connect and DSH combination has not been verified. The latest Codex Connect is verified with DSH {latestDshVersion}; move to that verified pair instead of installing an older plugin.",
			compatibilityDshUpdateAction: "Open DSH {version} release",
			compatibilityNotReadyTitle: "Codex Connect has not caught up with this DSH version",
			compatibilityNotReadyBody: "Neither your installed plugin nor the latest published plugin has been verified with this DSH version. This does not prove the combination will fail; report the gap so the maintainer can verify and adapt it.",
			compatibilityUnverifiedTitle: "Compatibility is not confirmed",
			compatibilityUnverifiedBody: "The compatibility information maintained by this project is temporarily unavailable. Check again later.",
			compatibilityDshSame: "DSH: {version} · Up to date",
			compatibilityDshDifferent: "DSH: Current {current} · Latest {latest}",
			compatibilityDshCurrentOnly: "DSH: Current {current} · Latest version unavailable",
			compatibilityDshLatestOnly: "DSH: Current version unavailable · Latest {latest}",
			compatibilityDshUnknown: "DSH: Current and latest versions unavailable",
			compatibilityPluginSame: "Codex Connect: {version} · Up to date",
			compatibilityPluginDifferent: "Codex Connect: Current {current} · Latest {latest}",
			compatibilityPluginCurrentOnly: "Codex Connect: Current {current} · Latest version unavailable",
			compatibilityReport: "Report a Codex Connect compatibility gap",
			compatibilityViewTracker: "View compatibility progress",
			currentVersion: "Current version: {version}",
			checkForUpdates: "Check for updates",
			checkingForUpdates: "Checking for updates…",
			upToDate: "You are using the latest available version ({version}).",
			updateCheckUnavailable: "Update information is temporarily unavailable. You can check again later.",
			newVersionAvailable: "New version available: {version}",
			whatMatters: "What matters for you",
			versionSummary: "Current {current} · {count} published release(s) behind",
			versionSummaryUnknown: "Current {current} · release gap unavailable",
			versionsBehind: "{count} published release(s) behind your current version.",
			versionsBehindUnknown: "The number of releases between these versions is unavailable.",
			noCuratedHighlights: "No user-facing highlights were provided. See the full release notes for technical details.",
			updateHighlightTrustedOrigins: "Remote browser access can now be explicitly trusted for a LAN setup.",
			updateHighlightRuntimeCompatibility: "Added a compatibility check and diagnostics so you can see whether the DSH and Node versions are supported.",
			updateHighlightQuotaFastMode: "Added per-conversation Fast Mode and GPT quota/reset indicators in the Composer.",
			updateHighlightDshRc7: "Added compatibility with DSH rc.7 plugin slots and a clearer runtime compatibility check.",
			updateHighlightSearchStability: "Improved search-session stability so new search records remain readable after restarts.",
			updateHighlightImageGeneration: "Added optional GPT Image generation in the Codex Connect settings and a preview card in the conversation.",
			updateHighlightOauthHistory: "Added safer session-history migration and a sign-in fallback when the account needs to reconnect.",
			updateHighlightModelVisibility: "You can now choose which Codex models appear in model selectors.",
			updateHighlightProxyConnection: "Added opt-in Codex proxy detection with explicit confirmation and a visible direct-connection fallback.",
			updateHighlightModelsAccount: "Added an Openai-Codex account card in Models settings for authorization, quota, and shared plugin settings.",
			updateHighlightContextBudget: "Added bounded per-model context budget controls while preserving each catalog default until you save an override.",
			updateHighlightAutoReviewProbe: "Added an explicit, synthetic probe for checking whether the hidden Codex approval reviewer is available without enabling it.",
			updateHighlightAutoReview: "Added optional Codex Auto-review for eligible Harness approvals, with first-use disclosure, fail-closed human fallback, and an exact-retry override.",
			updateHighlightAstraCompatibility: "Added GPT-6-Astra compatibility metadata when the installed upstream catalog does not provide the model.",
			updateHighlightMultiAccount: "Added management for multiple ChatGPT accounts; starting or cancelling authorization preserves existing accounts.",
			updateHighlightSearchRoute: "Enabling Codex Search now selects the profile-wide search route; disabling it restores the previous provider.",
			viewTechnicalDetails: "View technical details",
			hideTechnicalDetails: "Hide technical details",
			technicalDetailsHeading: "Technical changes",
			viewGithubLink: "View GitHub link",
			viewFullChangelog: "View full changelog",
			viewReleaseNotes: "View update notes",
			hideReleaseNotes: "Hide update notes",
			releaseNotesUnavailable: "Release notes are available on the release page.",
			openReleasePage: "Open release page",
			copyForAgent: "Copy for Agent",
			agentPromptCopied: "Agent prompt copied",
			agentPromptCopyFailed: "Copy was unavailable. Copy the Agent prompt manually.",
			agentUpgradePrompt: "Please open this project, check its latest version, and install or update the corresponding plugin in the current DSH Web profile: {repository}",
			agentUpgradeHelp: "Copy this short request to your Agent. It can inspect the project instructions and choose the appropriate install or update method.",
			agentUpgradeFinish: "After the Agent reports completion, return here and check the installed version again.",
			upgradeStepsHeading: "How to upgrade",
			recheckAfterUpgrade: "Done — check again",
			recheckingAfterUpgrade: "Checking after upgrade…",
			upgradeStillAvailable: "The running DSH Web process still reports {version}. Restart it, then check again.",
			upgradeCheckSuccess: "The plugin is up to date. Refresh this page if the interface does not reload.",
			dismissUpdate: "Later"
		};
		/** Chinese copy for the OpenAI Codex Plugin configuration card. */
		const zh = {
			title: "Codex Connect",
			modelsProviderName: "Openai-Codex",
			modelsProviderSupport: "由 Codex Connect 插件提供支持。",
			intro: "使用 ChatGPT 订阅在 dsh 中调用模型，并可使用 GPT Image 生成图片，无需 API Key。",
			accountHeading: "ChatGPT 账户",
			manageAccount: "管理",
			manageAccounts: "管理账户",
			hideAccounts: "收起账户",
			addAccount: "添加账户",
			savedAccounts: "已保存账户",
			currentAccount: "当前",
			currentAccountDetail: "当前账户",
			savedAccountDetail: "已保存账户",
			useAccount: "使用此账户",
			usingAccount: "正在使用",
			removeAccount: "移除",
			signOutAll: "退出所有账户",
			activeAccountHelp: "账户变更只影响之后发起的 Codex 请求，不会改变正在运行的请求。",
			addingAccountKeepsCurrent: "浏览器授权尚未完成。新请求仍会继续使用当前账户。",
			removeAccountTitle: "移除“{name}”？",
			removeAccountCopy: "该账户的本地授权凭据将被删除，不会退出其他账户。",
			removeActiveAccountCopy: "该账户的本地授权凭据将被删除，并切换到“{name}”。",
			removeLastAccountCopy: "这是最后一个已保存账户；移除后 Codex Connect 将退出登录。",
			cancel: "取消",
			confirmRemove: "确认移除",
			authorize: "授权",
			continueAuthorization: "继续授权",
			reauthorize: "重新授权",
			viewQuota: "查看额度",
			hideQuota: "收起额度",
			moreSettings: "更多设置",
			moreSettingsTitle: "Codex Connect 设置",
			closeSettings: "关闭",
			settingsSaveHint: "保存后两处设置同步生效；关闭将放弃未保存的修改。",
			reopenAuthorization: "重新打开授权",
			cancelSignIn: "取消登录",
			authorizationHelp: "可以重新打开授权页，或取消后重试。取消登录不会退出已有账户。",
			modelsAccountHelp: "代理、模型显示、搜索和图片选项仍可在“设置 → 插件 → Codex Connect”中管理，也可直接打开：",
			expand: "展开设置",
			collapse: "折叠设置",
			loadingAccount: "正在加载账户信息…",
			signedOut: "尚未登录",
			signingIn: "正在等待浏览器授权…",
			signedIn: "已登录",
			reauthRequired: "需要重新登录",
			login: "使用 ChatGPT 登录",
			loginAgain: "重新登录",
			logout: "退出登录",
			working: "处理中…",
			retry: "重试",
			popupBlocked: "浏览器阻止了登录窗口。请允许此 dsh 页面弹出窗口后重试。",
			popupBlockedFallback: "无法自动打开登录窗口。请使用下面的链接在浏览器中继续登录。",
			openLoginInBrowser: "打开 ChatGPT 登录页面",
			usageLimits: "使用额度",
			fiveHourLimit: "5 小时额度",
			weeklyLimit: "每周额度",
			hourLimit: "{count} 小时额度",
			usageWindow: "使用额度",
			percentRemaining: "剩余 {percent}%",
			resetAt: "{time} 重置",
			resetUnavailable: "重置时间不可用",
			composerWeeklyQuota: "Codex 周额度",
			composerFiveHourShort: "5h",
			composerWeeklyShort: "7d",
			composerFiveHourQuotaSummary: "Codex 5 小时额度：剩余 {percent}%；重置时间 {time}",
			composerWeeklyQuotaSummary: "Codex 周额度：剩余 {percent}%；重置时间 {time}",
			fastModeEnabledTitle: "当前：1.5 倍速度，额度消耗更快。点击切换到标准速度",
			fastModeDisabledTitle: "当前：标准速度。点击开启 1.5 倍速度",
			fastModeLoadingTitle: "正在加载此对话的 Fast Mode 状态。",
			fastModeUnavailableTitle: "此对话暂时无法使用 Fast Mode。",
			monthlyLimit: "每月信用额度",
			exactRemaining: "剩余 {remaining} / {limit} credits",
			credits: "Credits",
			unlimited: "无限",
			available: "可用",
			quotaUnavailable: "暂时无法获取使用额度。",
			requestFailed: "OpenAI Codex 账户请求失败。",
			remoteOriginTitle: "未信任远程浏览器 origin",
			remoteOriginDescription: "Codex Connect 只接受来自本机页面或设备所有者明确批准的 origin 的浏览器 OAuth 请求。",
			remoteOriginCommandHelp: "请在运行 DSH 的设备上手动执行下面的服务器命令，然后重新加载此页面。本页面不会自动执行：",
			remoteOriginCopy: "复制授权命令",
			remoteOriginCopied: "已复制",
			remoteOriginCopyFailed: "当前无法访问剪贴板，请手动复制命令。",
			configurationHeading: "Codex Connect 配置",
			settingsModules: "设置模块",
			accountModule: "账户与额度",
			accountModuleSummary: "状态：{status}",
			modelsModule: "模型",
			networkModule: "网络",
			capabilitiesModule: "能力",
			modelsModuleDefault: "显示全部目录模型",
			modelsModuleSelected: "已显示 {count} 个模型",
			networkModuleDirect: "当前直连",
			networkModuleProxy: "已启用代理",
			capabilitiesModuleEnabled: "已启用 {count} 项",
			modelCatalog: "模型选择器中显示的模型",
			modelCatalogIntro: "选择要在模型选择器中显示的 Codex 模型；隐藏模型后，已有会话仍可继续使用。",
			modelCatalogLoading: "正在加载可用模型…",
			modelCatalogFailed: "无法加载可用模型。",
			modelContext: "上下文",
			contextDefault: "目录默认",
			contextCustom: "自定义",
			contextAdjust: "调整",
			contextHide: "收起调整",
			contextTokens: "上下文长度",
			contextReset: "恢复默认",
			contextSlider: "调整上下文预算",
			contextMaximum: "配置上限",
			contextLimitSource: "依据：Codex 官方配置目录（2026-09-05）",
			contextLimitFallback: "尚未确认更高配置上限，暂以已安装目录的默认值为上限。",
			contextAboveDefault: "已超过目录默认值：请求可能消耗更多额度，或被当前账号、通道拒绝。本插件未对该范围进行容量实测。",
			contextWarning: "调整的是本地上下文预算，不会扩大服务端容量；设置过高可能导致请求失败。隐藏模型会保留其预算，修改在保存后生效。",
			contextInvalid: "请输入模型配置范围内的整数预算，或点击“恢复默认”。",
			capabilitiesHeading: "可选能力",
			capabilitiesIntro: "选择允许此 dsh profile 注册哪些额外的 Codex 能力。",
			networkHeading: "网络连接",
			networkIntro: "Codex Connect 默认直连。需要代理时，可以自动检测或手动输入地址。",
			currentConnection: "当前连接",
			proxyEnabled: "代理已启用",
			directConnection: "直连",
			directConnectionDescription: "不经过 Codex Connect 专用代理。",
			checkCurrentConnection: "检查当前连接",
			checkingCurrentConnectionButton: "检查中…",
			checkingCurrentConnection: "正在检查已保存的代理…",
			currentConnectionHealthy: "连接正常。",
			currentConnectionFailed: "已保存的代理无法到达 Codex 端点。",
			changeConnection: "更改连接",
			proxyConfigurationMethod: "代理配置方式",
			automaticDetection: "自动检测",
			manualEntry: "手动输入",
			automaticDetectionHelp: "检测本机常见代理端口和环境变量，不会修改当前设置。",
			scanLocalProxy: "扫描本机代理",
			manualProxyHelp: "输入不含账号、密码、路径、查询参数或片段的 HTTP(S) 代理地址。",
			proxyCandidateHealthy: "连接正常",
			currentProxy: "当前使用",
			selectedProxy: "已选择",
			proxyDetectionFailedTitle: "未发现可用代理",
			pendingProxy: "保存后将使用代理 {proxyUrl}。",
			pendingDirect: "保存后将停用代理并改为直连。",
			customProxyActive: "已选择自定义代理：{proxyUrl}",
			detectProxy: "检测代理",
			detectingProxy: "正在检测…",
			configureProxyManually: "手动配置",
			disableProxy: "停用代理",
			proxyCandidatesFound: "找到了可用的代理候选地址。请选择一个，将其暂存以便启用。",
			keepDirectConnection: "保持直连",
			useThisProxy: "使用此代理",
			proxyDetectionFailed: "没有找到可用代理。请检查 DNS、连接被拒绝、超时、TLS 或代理认证错误后重试。",
			proxyAddress: "自定义代理地址",
			testProxy: "测试代理",
			testingProxy: "正在测试…",
			proxyTestSucceeded: "代理已到达 Codex 端点（HTTP {status}）。",
			proxyTestFailed: "代理测试失败：{reason}。",
			proxyTestRequired: "启用前必须先成功测试当前这个代理地址。",
			invalidProxyUrl: "请输入不含凭据或路径的 HTTP(S) 代理 origin。",
			enableSearch: "启用 Codex 搜索提供方",
			enableSearchHelp: "让 OpenAI Codex 可用，并在启用期间将它选为整个 profile 的 Web 搜索提供方。",
			searchModel: "搜索模型",
			searchMode: "联网方式",
			modeCached: "缓存",
			modeIndexed: "索引",
			modeLive: "实时联网",
			searchContextSize: "搜索上下文",
			contextLow: "低",
			contextMedium: "中",
			contextHigh: "高",
			searchMaxOutputTokens: "搜索最大输出 Tokens",
			enableImageTool: "启用 view_image 工具",
			enableImageToolHelp: "允许具备视觉能力的模型在审批后读取本地图片或获取公网图片。",
			enableImageGeneration: "启用 GPT Image 图片生成",
			enableImageGenerationHelp: "启用后，GPT 模型可以在对话中调用 GPT Image 生成图片。",
			enableAutoReview: "Codex 自动审查（代我审批）",
			enableAutoReviewHelp: "将 OpenAI-Codex 会话中原本需要你确认的部分操作交给独立的 Codex 审查器。它只更换审批者，不会扩大 DSH 的文件、网络或工具权限。",
			autoReviewOfficialBadge: "Codex 官方能力",
			autoReviewDetails: "了解发送内容与失败处理",
			autoReviewDisclosure: "审查时，近期对话、相关工具调用与结果、工具参数、工作目录和待执行动作会发送到 chatgpt.com；隐藏推理和已保存凭据不会发送。",
			autoReviewFailureDisclosure: "审查器无法完成时仍由你审批；明确拒绝的操作不会执行。",
			autoReviewOfficialDocs: "查看 OpenAI Auto-review 官方文档",
			autoReviewConfirmTitle: "启用 Codex 自动审查？",
			autoReviewCancel: "取消",
			autoReviewConfirm: "确认",
			generating: "正在生成图片",
			generatingDetail: "图片生成正在进行中。停止操作会取消当前回合。",
			cancelGeneration: "停止当前回合",
			cancelingGeneration: "正在停止…",
			promptLabel: "用于生成图片的提示词",
			copyPrompt: "复制提示词",
			promptCopied: "已复制",
			promptCopyFailed: "无法复制",
			completed: "图片已生成",
			retryGeneration: "再次尝试",
			regenerate: "再生成一张",
			editImage: "基于此图修改",
			retryRequest: "重试上一张图片生成。",
			regenerateRequest: "再生成一张，保持上一张图片的提示词不变。",
			editRequest: "基于上一张图片继续修改。请先询问我需要修改什么，再生成新图片。",
			actionSending: "正在发送…",
			actionFailed: "无法发送后续请求。",
			failed: "图片生成失败",
			canceled: "图片生成已取消",
			canceledDetail: "本地等待已停止，请求可能仍在处理中。",
			unknownResult: "无法安全显示这次图片结果。",
			imageDetails: "图片详情",
			imageDetail: "{name}：{format} · {width} × {height} · {size}",
			originalImageDetail: "原图 {name}：{format} · {width} × {height} · {size}",
			previewImageDetail: "对话预览：{format} · {width} × {height} · {size}",
			download: "下载",
			downloadNamed: "下载 {name}",
			downloadOriginal: "下载原图",
			downloadOriginalNamed: "下载原图 {name}",
			downloadPreview: "下载预览图",
			downloadPreviewNamed: "下载预览图 {name}",
			downloading: "正在下载…",
			downloadFailed: "下载失败，重试",
			image: "生成的图片",
			open: "打开图片预览",
			openNamed: "打开 {name}",
			loading: "正在加载图片",
			loadFailed: "图片加载失败，重试",
			lightboxDialog: "图片预览",
			lightboxClose: "关闭图片预览",
			lightboxZoomIn: "放大",
			lightboxZoomOut: "缩小",
			lightboxReset: "适合窗口",
			routingNote: "这些设置绝不会改动默认模型。Codex 搜索启用期间会暂时接管整个 profile 的搜索路由。",
			settingsLoading: "正在加载插件设置…",
			settingsUnavailable: "此 dsh profile 无法使用插件设置。",
			settingsReadOnly: "此 profile 的插件设置为只读。",
			invalidSearchModel: "请输入搜索模型。",
			invalidSearchTokens: "搜索最大输出 Tokens 必须是正整数。",
			save: "保存更改",
			saving: "正在保存…",
			discard: "放弃更改",
			settingsSaved: "已保存",
			settingsSaveFailed: "无法保存设置。未保存的修改仍然保留，可以重试或放弃。",
			updateHeading: "更新与兼容性",
			compatibilityCompatibleTitle: "可以升级 DSH",
			compatibilityCompatibleBody: "当前 Codex Connect 已通过这里所示最新 DSH 版本的兼容性验证。",
			compatibilityCurrentTitle: "当前组合已验证兼容",
			compatibilityCurrentBody: "当前安装的 DSH 与 Codex Connect 组合已通过兼容性验证。",
			compatibilityCurrentDshUnknownTitle: "无法检测当前 DSH 版本",
			compatibilityCurrentDshUnknownBody: "可以取得最新 DSH 的兼容性记录，但无法检测当前运行的 DSH 版本。",
			compatibilityCurrentDshNewerTitle: "当前 DSH 新于兼容性记录",
			compatibilityCurrentDshNewerBody: "当前运行的 DSH 版本尚未确认兼容性。",
			compatibilityPluginUpdateTitle: "请先升级 Codex Connect",
			compatibilityPluginUpdateBody: "当前插件尚未通过该 DSH 版本的验证，但最新插件已经通过。请先升级插件，再升级 DSH。",
			compatibilityDshUpdateTitle: "当前版本组合尚未验证，请升级 DSH",
			compatibilityDshUpdateBody: "当前 Codex Connect 与 DSH 的精确组合尚未验证。最新版 Codex Connect 已与 DSH {latestDshVersion} 完成验证；请升级到这组已验证版本，不必安装旧版插件。",
			compatibilityDshUpdateAction: "打开 DSH {version} 发布页",
			compatibilityNotReadyTitle: "Codex Connect 尚未跟上此 DSH 版本",
			compatibilityNotReadyBody: "当前插件和最新发布的插件都尚未通过该 DSH 版本的兼容性验证。这不代表它一定无法运行；请反馈此适配缺口，让维护者尽快验证并更新。",
			compatibilityUnverifiedTitle: "兼容性尚未确认",
			compatibilityUnverifiedBody: "暂时无法取得本项目维护的兼容性信息，请稍后重新检查。",
			compatibilityDshSame: "DSH：{version} · 已是最新",
			compatibilityDshDifferent: "DSH：当前 {current} · 最新 {latest}",
			compatibilityDshCurrentOnly: "DSH：当前 {current} · 无法取得最新版本",
			compatibilityDshLatestOnly: "DSH：无法检测当前版本 · 最新 {latest}",
			compatibilityDshUnknown: "DSH：无法检测当前版本，也无法取得最新版本",
			compatibilityPluginSame: "Codex Connect：{version} · 已是最新",
			compatibilityPluginDifferent: "Codex Connect：当前 {current} · 最新 {latest}",
			compatibilityPluginCurrentOnly: "Codex Connect：当前 {current} · 无法取得最新版本",
			compatibilityReport: "反馈 Codex Connect 兼容性缺口",
			compatibilityViewTracker: "查看兼容性跟进",
			currentVersion: "当前版本：{version}",
			checkForUpdates: "检查更新",
			checkingForUpdates: "正在检查更新…",
			upToDate: "当前已经是最新可用版本（{version}）。",
			updateCheckUnavailable: "暂时无法获取更新信息，稍后可以再次检查。",
			newVersionAvailable: "发现新版本：{version}",
			whatMatters: "这次更新对你有什么用",
			versionSummary: "当前版本 {current} · 相差 {count} 个已发布版本",
			versionSummaryUnknown: "当前版本 {current} · 暂时无法确定相差几个版本",
			versionsBehind: "你的当前版本落后 {count} 个已发布版本。",
			versionsBehindUnknown: "暂时无法确定这两个版本之间相差几个已发布版本。",
			noCuratedHighlights: "暂时没有整理好的用户功能摘要，可以打开完整技术说明查看发布内容。",
			updateHighlightTrustedOrigins: "局域网浏览器访问现在可以明确设置信任来源。",
			updateHighlightRuntimeCompatibility: "增加兼容性检查和诊断信息，方便确认当前 DSH 与 Node 版本是否受支持。",
			updateHighlightQuotaFastMode: "Composer 增加了按对话生效的 Fast Mode，以及 GPT 模型额度和重置时间提示。",
			updateHighlightDshRc7: "支持 DSH rc.7 的插件槽位，并提供更清楚的运行环境兼容性检查。",
			updateHighlightSearchStability: "改进搜索会话稳定性，重启后新写入的搜索记录仍能正常读取。",
			updateHighlightImageGeneration: "在 Codex Connect 设置中加入可选的 GPT Image 生图，并在对话里展示生成结果卡片。",
			updateHighlightOauthHistory: "增加更安全的会话历史迁移，并在账号需要重新登录时提供备用登录路径。",
			updateHighlightModelVisibility: "现在可以选择哪些 Codex 模型显示在模型选择菜单中。",
			updateHighlightProxyConnection: "增加可选的 Codex 代理检测，启用前需要明确确认，并始终保留直连回退入口。",
			updateHighlightModelsAccount: "在模型设置中增加 Openai-Codex 账户卡，用于授权、查看额度和打开共享插件设置。",
			updateHighlightContextBudget: "增加有范围限制的逐模型上下文预算设置；保存覆盖值前继续使用各模型的目录默认值。",
			updateHighlightAutoReviewProbe: "增加显式的合成探针，用于检查隐藏的 Codex 审批 reviewer 是否可用，但不会启用该能力。",
			updateHighlightAutoReview: "增加可选的 Codex 自动审查，用于符合条件的 Harness 审批；首次启用需确认告知，失败会回到人工审批，并支持一次完全相同的人工覆盖重试。",
			updateHighlightAstraCompatibility: "当已安装的上游模型目录尚未提供 GPT-6-Astra 时，补充该模型的兼容元数据。",
			updateHighlightMultiAccount: "增加多个 ChatGPT 账户的管理能力；开始或取消授权时会保留已有账户。",
			updateHighlightSearchRoute: "启用 Codex 搜索时，现在会选中整个 profile 的搜索路由；关闭时恢复此前的提供方。",
			viewTechnicalDetails: "查看完整技术说明",
			hideTechnicalDetails: "收起技术说明",
			technicalDetailsHeading: "技术变更",
			viewGithubLink: "查看 GitHub 链接",
			viewFullChangelog: "查看完整变更记录",
			viewReleaseNotes: "查看更新说明",
			hideReleaseNotes: "收起更新说明",
			releaseNotesUnavailable: "完整更新说明可在发布页面查看。",
			openReleasePage: "打开发布页面",
			copyForAgent: "复制给 Agent",
			agentPromptCopied: "Agent 提示已复制",
			agentPromptCopyFailed: "当前无法访问剪贴板，请手动复制上面的 Agent 提示。",
			agentUpgradePrompt: "请到这个项目查看最新版本，并把对应插件安装或更新到当前 DSH Web profile：{repository}",
			agentUpgradeHelp: "把下面这段简短请求发给你的 Agent。它会查看项目说明，自行判断合适的安装或更新方式。",
			agentUpgradeFinish: "Agent 报告完成后，回到这里重新检查实际安装版本。",
			upgradeStepsHeading: "如何升级",
			recheckAfterUpgrade: "已完成，重新检查",
			recheckingAfterUpgrade: "正在检查升级结果…",
			upgradeStillAvailable: "当前运行中的 DSH Web 仍显示版本 {version}。请先重启它，再重新检查。",
			upgradeCheckSuccess: "插件已是最新版本。如果界面没有自动更新，请刷新页面。",
			dismissUpdate: "稍后提醒"
		};
		//#endregion
		//#region src/image-assets-contract.ts
		/** Same-origin endpoint serving one session-owned original generated image. */
		const OPENAI_CODEX_ORIGINAL_IMAGE_PATH = "/plugins/dsh-codex-connect/images/original";
		/** Opaque identifier format for one plugin-owned original image. */
		const OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN = /^img_[0-9a-f]{32}$/u;
		function positiveSafeInteger$1(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
		}
		/** Decode session-log metadata without trusting an asset id, filename, or media type. */
		function decodeOpenAICodexOriginalImageRef(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const candidate = value;
			if (typeof candidate.assetId !== "string" || !OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(candidate.assetId) || candidate.mediaType !== "image/png" && candidate.mediaType !== "image/jpeg" && candidate.mediaType !== "image/webp" || !positiveSafeInteger$1(candidate.width) || !positiveSafeInteger$1(candidate.height) || !positiveSafeInteger$1(candidate.bytes) || candidate.bytes > 50331648 || typeof candidate.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(candidate.name) || typeof candidate.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(candidate.sha256)) return void 0;
			return {
				assetId: candidate.assetId,
				mediaType: candidate.mediaType,
				width: candidate.width,
				height: candidate.height,
				bytes: candidate.bytes,
				name: candidate.name,
				sha256: candidate.sha256
			};
		}
		/** Build a same-origin URL without allowing either opaque id to become a path segment. */
		function openAICodexOriginalImageUrl(sessionId, assetId) {
			const query = new URLSearchParams({
				sessionId,
				assetId
			});
			return `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?${query.toString()}`;
		}
		//#endregion
		//#region src/image-presentation.ts
		/** Stable metadata marker for generated image result views. */
		const IMAGE_PRESENTATION_KIND = "codex-connect-images";
		function positiveSafeInteger(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
		}
		function mediaType(value) {
			return value === "image/png" || value === "image/jpeg" || value === "image/webp";
		}
		function imageRef(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const candidate = value;
			if (typeof candidate.attachmentId !== "string" || candidate.attachmentId.length === 0 || !mediaType(candidate.mediaType) || !positiveSafeInteger(candidate.bytes) || !positiveSafeInteger(candidate.width) || !positiveSafeInteger(candidate.height) || candidate.name !== void 0 && (typeof candidate.name !== "string" || candidate.name.length === 0)) return void 0;
			return {
				attachmentId: candidate.attachmentId,
				mediaType: candidate.mediaType,
				bytes: candidate.bytes,
				width: candidate.width,
				height: candidate.height,
				...candidate.name === void 0 ? {} : { name: candidate.name }
			};
		}
		/** Decode durable tool-result metadata without trusting arbitrary session JSON. */
		function decodeImagePresentationMeta(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const candidate = value;
			if (candidate.kind !== "codex-connect-images" || typeof candidate.prompt !== "string" || candidate.prompt.length < 1 || candidate.prompt.length > 32e3 || !Array.isArray(candidate.images) || candidate.images.length < 1 || candidate.images.length > 4) return void 0;
			if (candidate.schemaVersion === void 0) {
				const previews = candidate.images.map(imageRef);
				if (previews.some((image) => image === void 0)) return void 0;
				return {
					kind: IMAGE_PRESENTATION_KIND,
					schemaVersion: 1,
					prompt: candidate.prompt,
					images: previews.map((preview) => ({ preview }))
				};
			}
			if (candidate.schemaVersion !== 1) return void 0;
			const images = [];
			for (const value of candidate.images) {
				if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
				const entry = value;
				const preview = imageRef(entry.preview);
				const original = decodeOpenAICodexOriginalImageRef(entry.original);
				if (preview === void 0 || original === void 0) return void 0;
				images.push({
					preview,
					original
				});
			}
			return {
				kind: IMAGE_PRESENTATION_KIND,
				schemaVersion: 1,
				prompt: candidate.prompt,
				images
			};
		}
		//#endregion
		//#region src/client/CodexImageGallery.tsx
		/** Self-contained result-image gallery for the tool-call view.
		*
		* DSH keeps the attachment package's React atoms behind its
		* conversation slots. A tool-call view cannot render those slots, so this
		* gallery owns only the durable-image presentation it needs and receives all
		* stateful work through props.
		*/
		const galleryStyle = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "flex-start",
			gap: 8
		};
		const imageFrameStyle = {
			display: "grid",
			placeItems: "center",
			padding: 0,
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-base)",
			color: "var(--dsw-alias-label-secondary)",
			cursor: "pointer"
		};
		const loadingStyle = {
			padding: 10,
			fontSize: 12
		};
		const errorStyle = {
			minHeight: 32,
			padding: "6px 10px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			background: "transparent",
			color: "var(--dsw-alias-label-secondary)",
			cursor: "pointer"
		};
		const lightboxStyle = {
			position: "relative",
			width: "100%",
			height: "92vh",
			minWidth: 0,
			minHeight: 0,
			overflow: "hidden",
			background: "var(--dsw-alias-bg-base, #111)"
		};
		const lightboxViewportStyle = {
			width: "100%",
			height: "100%",
			overflow: "auto",
			touchAction: "none",
			overscrollBehavior: "contain"
		};
		const lightboxImageStyle = {
			display: "block",
			width: "100%",
			height: "100%",
			objectFit: "contain",
			userSelect: "none",
			pointerEvents: "none"
		};
		const lightboxControlsStyle = {
			position: "absolute",
			top: 8,
			left: 8,
			zIndex: 1,
			display: "flex",
			alignItems: "center",
			gap: 6,
			padding: 4,
			borderRadius: 9,
			background: "rgba(0,0,0,0.55)",
			color: "#fff"
		};
		const lightboxButtonStyle = {
			minWidth: 32,
			height: 32,
			padding: "0 8px",
			border: "1px solid rgba(255,255,255,0.35)",
			borderRadius: 7,
			background: "rgba(0,0,0,0.35)",
			color: "#fff",
			font: "inherit",
			cursor: "pointer"
		};
		const closeStyle = {
			...lightboxButtonStyle,
			position: "absolute",
			top: 8,
			right: 8,
			zIndex: 1,
			width: 32,
			padding: 0
		};
		const MIN_ZOOM = 1;
		const MAX_ZOOM = 4;
		const ZOOM_STEP = .5;
		function singleFit(attachment) {
			const natural = attachment.width / attachment.height;
			const ratio = Math.min(4, Math.max(.25, natural));
			const box = ratio >= 1 ? {
				width: 240,
				height: 240 / ratio
			} : {
				width: 240 * ratio,
				height: 240
			};
			const scale = Math.min(1, attachment.width / box.width, attachment.height / box.height);
			return {
				width: Math.max(1, Math.round(box.width * scale)),
				height: Math.max(1, Math.round(box.height * scale)),
				objectPosition: natural < .25 ? "center top" : natural > 4 ? "left center" : "center"
			};
		}
		function CodexImageLightbox({ src, alt, labels, opener, onClose }) {
			const lightbox = (0, react.useRef)(null);
			const closeButton = (0, react.useRef)(null);
			const viewport = (0, react.useRef)(null);
			const dragStart = (0, react.useRef)(null);
			const [zoom, setZoom] = (0, react.useState)(MIN_ZOOM);
			const [dragging, setDragging] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				closeButton.current?.focus();
				return () => {
					opener?.focus();
				};
			}, [opener]);
			(0, react.useLayoutEffect)(() => {
				const dialog = lightbox.current?.closest("[role=\"dialog\"]");
				if (dialog === null || dialog === void 0) return;
				const previousWidth = dialog.style.width;
				const previousMaxWidth = dialog.style.maxWidth;
				dialog.style.width = "96vw";
				dialog.style.maxWidth = "1200px";
				return () => {
					dialog.style.width = previousWidth;
					dialog.style.maxWidth = previousMaxWidth;
				};
			}, []);
			(0, react.useEffect)(() => {
				if (zoom !== MIN_ZOOM || viewport.current === null) return;
				viewport.current.scrollLeft = 0;
				viewport.current.scrollTop = 0;
			}, [zoom]);
			const beginDrag = (event) => {
				if (zoom === MIN_ZOOM || event.button !== 0) return;
				dragStart.current = {
					pointerId: event.pointerId,
					clientX: event.clientX,
					clientY: event.clientY,
					scrollLeft: event.currentTarget.scrollLeft,
					scrollTop: event.currentTarget.scrollTop
				};
				event.currentTarget.setPointerCapture?.(event.pointerId);
				setDragging(true);
			};
			const drag = (event) => {
				const start = dragStart.current;
				if (start === null || start.pointerId !== event.pointerId) return;
				event.currentTarget.scrollLeft = start.scrollLeft - (event.clientX - start.clientX);
				event.currentTarget.scrollTop = start.scrollTop - (event.clientY - start.clientY);
				event.preventDefault();
			};
			const endDrag = (event) => {
				if (dragStart.current?.pointerId !== event.pointerId) return;
				dragStart.current = null;
				if (event.currentTarget.hasPointerCapture?.(event.pointerId) === true) event.currentTarget.releasePointerCapture(event.pointerId);
				setDragging(false);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: labels.dialog,
				headless: true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: lightbox,
					style: lightboxStyle,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: lightboxControlsStyle,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": labels.zoomOut,
									title: labels.zoomOut,
									style: lightboxButtonStyle,
									disabled: zoom === MIN_ZOOM,
									onClick: () => {
										setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP));
									},
									children: "−"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [Math.round(zoom * 100), "%"] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": labels.zoomIn,
									title: labels.zoomIn,
									style: lightboxButtonStyle,
									disabled: zoom === MAX_ZOOM,
									onClick: () => {
										setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP));
									},
									children: "+"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": labels.reset,
									title: labels.reset,
									style: lightboxButtonStyle,
									disabled: zoom === MIN_ZOOM,
									onClick: () => {
										setZoom(MIN_ZOOM);
									},
									children: labels.reset
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							ref: closeButton,
							type: "button",
							"aria-label": labels.close,
							title: labels.close,
							style: closeStyle,
							onClick: onClose,
							children: "×"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							ref: viewport,
							"data-testid": "codex-image-lightbox-viewport",
							"data-zoom": String(zoom),
							style: {
								...lightboxViewportStyle,
								cursor: zoom === MIN_ZOOM ? "default" : dragging ? "grabbing" : "grab"
							},
							onPointerDown: beginDrag,
							onPointerMove: drag,
							onPointerUp: endDrag,
							onPointerCancel: endDrag,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									width: `${zoom * 100}%`,
									height: `${zoom * 100}%`
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									src,
									alt,
									draggable: false,
									style: lightboxImageStyle
								})
							})
						})
					]
				})
			});
		}
		function CodexMessageImage({ attachment, load, variant, labels }) {
			const [src, setSrc] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(false);
			const [attempt, setAttempt] = (0, react.useState)(0);
			const opener = (0, react.useRef)(null);
			const retry = (0, react.useCallback)(() => {
				setAttempt((value) => value + 1);
			}, []);
			const closeLightbox = (0, react.useCallback)(() => {
				setOpen(false);
			}, []);
			const fit = (0, react.useMemo)(() => variant === "single" ? singleFit(attachment) : void 0, [
				attachment.attachmentId,
				attachment.height,
				attachment.width,
				variant
			]);
			(0, react.useEffect)(() => {
				let live = true;
				setError(false);
				setSrc(null);
				load(attachment).then((url) => {
					if (live) setSrc(url);
				}).catch(() => {
					if (live) setError(true);
				});
				return () => {
					live = false;
				};
			}, [
				attachment.attachmentId,
				attachment.bytes,
				attachment.height,
				attachment.mediaType,
				attachment.name,
				attachment.width,
				attempt,
				load
			]);
			const label = attachment.name ?? labels.image;
			if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: errorStyle,
				"data-variant": variant,
				onClick: retry,
				children: labels.loadFailed
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				ref: opener,
				style: fit === void 0 ? {
					...imageFrameStyle,
					width: 64,
					height: 64
				} : {
					...imageFrameStyle,
					width: fit.width,
					height: fit.height
				},
				"data-variant": variant,
				title: labels.open,
				"aria-label": labels.openNamed(label),
				onClick: () => {
					if (src !== null) setOpen(true);
				},
				children: src === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: loadingStyle,
					children: labels.loading
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: label,
					style: {
						display: "block",
						width: "100%",
						height: "100%",
						objectFit: "cover",
						objectPosition: fit?.objectPosition
					}
				})
			}), open && src !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexImageLightbox, {
				src,
				alt: label,
				labels: labels.lightbox,
				opener: opener.current,
				onClose: closeLightbox
			}) : null] });
		}
		/** Render durable generated images without relying on rc.2 private React atoms. */
		function CodexImageGallery({ images, load, align, labels }) {
			if (images.length === 0) return null;
			const variant = images.length === 1 ? "single" : "tile";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "codex-image-gallery",
				"data-align": align,
				style: {
					...galleryStyle,
					justifyContent: align === "end" ? "flex-end" : "flex-start"
				},
				children: images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexMessageImage, {
					...image,
					load,
					variant,
					labels
				}, `${image.attachment.attachmentId}:${index}`))
			});
		}
		//#endregion
		//#region src/client/CodexImageToolView.tsx
		/** Native browser view for Codex image-generation tool results. */
		const shell = {
			containerType: "inline-size",
			padding: 12,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-module-platform)",
			color: "var(--dsw-alias-label-primary)"
		};
		const header = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 12
		};
		const detail = {
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: 13,
			lineHeight: "18px"
		};
		const progress = {
			width: "100%",
			height: 4,
			accentColor: "var(--dsw-alias-brand-primary)"
		};
		const action = {
			justifySelf: "start",
			minHeight: 28,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			padding: "3px 10px",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			cursor: "pointer"
		};
		const actionRow = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			gap: 8
		};
		const promptText = {
			boxSizing: "border-box",
			width: "100%",
			maxHeight: 96,
			margin: 0,
			overflowY: "auto",
			padding: "10px 42px 10px 12px",
			color: "var(--dsw-alias-label-secondary)",
			fontFamily: "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
			fontSize: 12,
			lineHeight: "18px",
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere",
			userSelect: "text"
		};
		const layoutStyle = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "flex-start",
			gap: 14,
			minWidth: 0
		};
		const visualStyle = {
			display: "grid",
			alignContent: "start",
			flex: "1 1 240px",
			maxWidth: 320,
			gap: 10,
			minWidth: 0
		};
		const sideStyle = {
			display: "grid",
			alignContent: "start",
			flex: "2 1 280px",
			gap: 10,
			minWidth: 0
		};
		const promptPanelStyle = {
			display: "grid",
			alignContent: "start",
			gap: 10,
			minWidth: 0
		};
		const promptLabelStyle = {
			fontSize: 13,
			fontWeight: 600,
			lineHeight: "18px",
			color: "var(--dsw-alias-label-primary)"
		};
		const promptBlockStyle = {
			position: "relative",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-base)"
		};
		const copyButtonStyle = {
			position: "absolute",
			zIndex: 1,
			top: 7,
			right: 7,
			display: "grid",
			placeItems: "center",
			width: 28,
			height: 28,
			padding: 0,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			color: "var(--dsw-alias-label-secondary)",
			background: "var(--dsw-alias-bg-layer-1)",
			cursor: "pointer",
			transition: "opacity 120ms ease"
		};
		const tooltipStyle = {
			position: "absolute",
			zIndex: 100,
			top: -8,
			right: 0,
			transform: "translateY(-100%)",
			width: "max-content",
			maxWidth: "min(260px, 50vw)",
			padding: "3px 7px",
			borderRadius: 8,
			background: "var(--dsw-alias-tooltip-bg)",
			color: "var(--dsw-static-neutral-bluish-00)",
			fontSize: 13,
			lineHeight: "20px",
			whiteSpace: "pre-line",
			overflowWrap: "break-word",
			pointerEvents: "none"
		};
		const visuallyHidden = {
			position: "absolute",
			width: 1,
			height: 1,
			padding: 0,
			margin: -1,
			overflow: "hidden",
			clip: "rect(0 0 0 0)",
			whiteSpace: "nowrap",
			border: 0
		};
		function contentText(content) {
			for (const block of content) if (typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string") return block.text;
		}
		function presentation(block) {
			if (!("kind" in block) || block.kind !== "tool-result" || block.isError) return void 0;
			return decodeImagePresentationMeta(block.meta);
		}
		function promptFromArgs(raw) {
			try {
				const value = JSON.parse(raw);
				if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
				const prompt = value.prompt;
				if (typeof prompt !== "string") return void 0;
				const trimmed = prompt.trim();
				return trimmed.length > 0 && trimmed.length <= 32e3 ? trimmed : void 0;
			} catch {
				return;
			}
		}
		function promptFor(block) {
			if (!("kind" in block)) return promptFromArgs(block.argsRaw);
			const decoded = decodeImagePresentationMeta(block.meta);
			if (decoded !== void 0) return decoded.prompt;
			return block.call === null ? void 0 : promptFromArgs(block.call.argsRaw);
		}
		function useSessionActions(sessionId, sessions) {
			const [pending, setPending] = (0, react.useState)(null);
			const [failed, setFailed] = (0, react.useState)(false);
			const alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => () => {
				alive.current = false;
			}, []);
			const run = (0, react.useCallback)(async (actionName, content) => {
				if (pending !== null) return false;
				const binding = sessions.binding(sessionId);
				if (binding === void 0) {
					setFailed(true);
					return false;
				}
				setFailed(false);
				setPending(actionName);
				try {
					const accepted = (actionName === "cancel" ? await binding.session.cancel() : await binding.session.prompt(content ?? [], "queue")).ok;
					if (alive.current) {
						setPending(null);
						setFailed(!accepted);
					}
					return accepted;
				} catch {
					if (alive.current) {
						setPending(null);
						setFailed(true);
					}
					return false;
				}
			}, [
				pending,
				sessionId,
				sessions
			]);
			return {
				pending,
				failed,
				cancel: (0, react.useCallback)(() => run("cancel"), [run]),
				followUp: (0, react.useCallback)((text) => run("follow-up", [{
					type: "text",
					text
				}]), [run])
			};
		}
		function followUpPrompt(kind, prompt, t) {
			if (kind === "edit") return `${prompt}\n\n${t("editRequest")}`;
			return prompt;
		}
		function ActionError({ visible, t }) {
			return visible ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				role: "status",
				style: detail,
				children: t("actionFailed")
			}) : null;
		}
		function triggerDownload(url, name) {
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = name;
			anchor.rel = "noopener";
			document.body.append(anchor);
			try {
				anchor.click();
			} finally {
				anchor.remove();
			}
		}
		function DownloadButton({ label, onDownload, t }) {
			const [state, setState] = (0, react.useState)("idle");
			const alive = (0, react.useRef)(true);
			(0, react.useEffect)(() => () => {
				alive.current = false;
			}, []);
			async function download() {
				if (state === "pending") return;
				setState("pending");
				try {
					await onDownload();
					if (alive.current) setState("idle");
				} catch {
					if (alive.current) setState("failed");
				}
			}
			const status = state === "pending" ? t("downloading") : state === "failed" ? t("downloadFailed") : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: action,
				disabled: state === "pending",
				"aria-busy": state === "pending",
				"data-download-state": state,
				onClick: () => {
					download();
				},
				children: status ?? label
			}), status === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				role: "status",
				"aria-live": "polite",
				style: visuallyHidden,
				children: status
			})] });
		}
		async function downloadOriginal(sessionId, original) {
			const response = await fetch(openAICodexOriginalImageUrl(sessionId, original.assetId), {
				method: "GET",
				headers: { accept: original.mediaType },
				credentials: "same-origin"
			});
			if (!response.ok) throw new Error("Original image download failed");
			const blob = await response.blob();
			if (blob.size !== original.bytes) throw new Error("Original image download was incomplete");
			const url = URL.createObjectURL(blob);
			try {
				triggerDownload(url, original.name);
			} finally {
				URL.revokeObjectURL(url);
			}
		}
		function PromptPanel({ prompt, t }) {
			const [copyState, setCopyState] = (0, react.useState)("idle");
			const [hovered, setHovered] = (0, react.useState)(false);
			const [focused, setFocused] = (0, react.useState)(false);
			const [hoverless, setHoverless] = (0, react.useState)(false);
			const [tooltipVisible, setTooltipVisible] = (0, react.useState)(false);
			const tooltipId = (0, react.useId)();
			(0, react.useEffect)(() => {
				if (copyState === "idle") return;
				const timer = window.setTimeout(() => {
					setCopyState("idle");
				}, 2e3);
				return () => {
					window.clearTimeout(timer);
				};
			}, [copyState]);
			(0, react.useEffect)(() => {
				if (typeof window.matchMedia !== "function") return;
				const query = window.matchMedia("(hover: none)");
				const update = () => {
					setHoverless(query.matches);
				};
				update();
				query.addEventListener("change", update);
				return () => {
					query.removeEventListener("change", update);
				};
			}, []);
			async function copy() {
				setCopyState(await (0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(prompt) ? "copied" : "failed");
			}
			const copyLabel = copyState === "copied" ? t("promptCopied") : copyState === "failed" ? t("promptCopyFailed") : t("copyPrompt");
			const showCopy = hovered || focused || hoverless || copyState !== "idle";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: promptPanelStyle,
				"aria-label": t("promptLabel"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: promptLabelStyle,
						children: t("promptLabel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: promptBlockStyle,
						onMouseEnter: () => {
							setHovered(true);
						},
						onMouseLeave: () => {
							setHovered(false);
						},
						onFocusCapture: () => {
							setFocused(true);
						},
						onBlurCapture: () => {
							setFocused(false);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...copyButtonStyle,
									opacity: showCopy ? 1 : 0
								},
								"aria-label": copyLabel,
								"aria-describedby": tooltipVisible ? tooltipId : void 0,
								"data-copy-state": copyState,
								onMouseEnter: () => {
									setTooltipVisible(true);
								},
								onMouseLeave: () => {
									setTooltipVisible(false);
								},
								onFocus: () => {
									setTooltipVisible(true);
								},
								onBlur: () => {
									setTooltipVisible(false);
								},
								onClick: () => {
									copy();
								},
								children: copyState === "copied" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutline16, {})
							}),
							tooltipVisible ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								id: tooltipId,
								role: "tooltip",
								style: tooltipStyle,
								children: copyLabel
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
								style: promptText,
								tabIndex: 0,
								children: prompt
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						role: "status",
						"aria-live": "polite",
						style: {
							position: "absolute",
							width: 1,
							height: 1,
							overflow: "hidden",
							clipPath: "inset(50%)"
						},
						children: copyState === "idle" ? "" : copyLabel
					})
				]
			});
		}
		function ResponsiveCard({ visual, side, label }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				style: shell,
				"aria-label": label,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: layoutStyle,
					"data-testid": "image-generation-layout",
					"data-responsive-layout": "visual-prompt",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: side === void 0 ? {
							...visualStyle,
							maxWidth: "none"
						} : visualStyle,
						"data-testid": "image-generation-visual",
						children: visual
					}), side === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: sideStyle,
						"data-testid": "image-generation-prompt",
						children: side
					})]
				})
			});
		}
		function formatBytes(bytes) {
			if (bytes < 1e3) return `${String(bytes)} B`;
			if (bytes < 1e6) return `${(bytes / 1e3).toFixed(bytes < 1e4 ? 1 : 0)} KB`;
			return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
		}
		function formatMediaType(mediaType) {
			return mediaType === "image/jpeg" ? "JPEG" : mediaType.slice(6).toUpperCase();
		}
		function useImageLoader(sessionId, sessions) {
			const urls = (0, react.useRef)(/* @__PURE__ */ new Map());
			const pending = (0, react.useRef)(/* @__PURE__ */ new Map());
			const activeSession = (0, react.useRef)(sessionId);
			const disposed = (0, react.useRef)(false);
			activeSession.current = sessionId;
			(0, react.useEffect)(() => () => {
				disposed.current = true;
				for (const entry of urls.current.values()) URL.revokeObjectURL(entry.url);
				urls.current.clear();
			}, []);
			(0, react.useEffect)(() => () => {
				for (const [key, entry] of urls.current) {
					if (entry.sessionId !== sessionId) continue;
					URL.revokeObjectURL(entry.url);
					urls.current.delete(key);
				}
			}, [sessionId]);
			return (0, react.useCallback)(async (attachment) => {
				const key = `${sessionId}\u0000${attachment.attachmentId}`;
				const cached = urls.current.get(key);
				if (cached !== void 0) return cached.url;
				const inflight = pending.current.get(key);
				if (inflight !== void 0) return inflight;
				const request = (async () => {
					const binding = sessions.binding(sessionId);
					if (binding === void 0) throw new Error("Image session is unavailable");
					const result = await binding.session.readAttachment(attachment.attachmentId);
					if (!result.ok || result.value.attachment.attachmentId !== attachment.attachmentId) throw new Error("Image attachment could not be read");
					if (disposed.current || activeSession.current !== sessionId) throw new Error("Image view is no longer active");
					const bytes = result.value.data.slice().buffer;
					const url = URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }));
					urls.current.set(key, {
						sessionId,
						url
					});
					return url;
				})().finally(() => {
					pending.current.delete(key);
				});
				pending.current.set(key, request);
				return request;
			}, [sessionId, sessions]);
		}
		function labels(t) {
			return {
				image: t("image"),
				open: t("open"),
				openNamed: (label) => t("openNamed", { name: label }),
				loading: t("loading"),
				loadFailed: t("loadFailed"),
				lightbox: {
					dialog: t("lightboxDialog"),
					close: t("lightboxClose"),
					zoomIn: t("lightboxZoomIn"),
					zoomOut: t("lightboxZoomOut"),
					reset: t("lightboxReset")
				}
			};
		}
		function errorState(block, t) {
			const code = block.error?.code;
			if (code === "ABORTED" || code === "ABORTED_BEFORE_DISPATCH" || code === "TOOL_ABORTED") return {
				title: t("canceled"),
				detail: t("canceledDetail")
			};
			const reauth = code === "OPENAI_CODEX_REAUTH_REQUIRED" || contentText(block.content)?.includes("authorization") === true;
			return {
				title: t("failed"),
				detail: reauth ? t("reauthRequired") : void 0
			};
		}
		function CodexImageToolView({ block, sessionId, t, sessions }) {
			const load = useImageLoader(sessionId, sessions);
			const sessionActions = useSessionActions(sessionId, sessions);
			const galleryLabels = (0, react.useMemo)(() => labels(t), [t]);
			const prompt = promptFor(block);
			const decoded = (0, react.useMemo)(() => presentation(block), [block]);
			if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResponsiveCard, {
				label: t("generating"),
				visual: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "grid",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: header,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("generating") })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
							style: progress,
							"aria-label": t("generating")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: detail,
							children: t("generatingDetail")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: actionRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: action,
								disabled: sessionActions.pending !== null,
								"aria-busy": sessionActions.pending === "cancel",
								onClick: () => {
									sessionActions.cancel();
								},
								children: sessionActions.pending === "cancel" ? t("cancelingGeneration") : t("cancelGeneration")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionError, {
								visible: sessionActions.failed,
								t
							})]
						})
					]
				}),
				side: prompt === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptPanel, {
					prompt,
					t
				})
			});
			if (block.isError) {
				const state = errorState(block, t);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResponsiveCard, {
					label: state.title,
					visual: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "status",
						style: {
							display: "grid",
							gap: 10
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: state.title }),
							state.detail === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: detail,
								children: state.detail
							}),
							prompt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: actionRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: action,
									disabled: sessionActions.pending !== null,
									"aria-busy": sessionActions.pending === "follow-up",
									onClick: () => {
										sessionActions.followUp(followUpPrompt("retry", prompt, t));
									},
									children: sessionActions.pending === "follow-up" ? t("actionSending") : t("retryGeneration")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionError, {
									visible: sessionActions.failed,
									t
								})]
							})
						]
					}),
					side: prompt === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptPanel, {
						prompt,
						t
					})
				});
			}
			if (decoded === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: shell,
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("completed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: detail,
					children: t("unknownResult")
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResponsiveCard, {
				label: t("completed"),
				visual: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					style: header,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("completed") })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexImageGallery, {
					images: decoded.images.map((image) => ({ attachment: image.preview })),
					load,
					align: "start",
					labels: galleryLabels
				})] }),
				side: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptPanel, {
						prompt: decoded.prompt,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: actionRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: action,
								disabled: sessionActions.pending !== null,
								"aria-busy": sessionActions.pending === "follow-up",
								onClick: () => {
									sessionActions.followUp(followUpPrompt("regenerate", decoded.prompt, t));
								},
								children: sessionActions.pending === "follow-up" ? t("actionSending") : t("regenerate")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: action,
								disabled: sessionActions.pending !== null,
								"aria-busy": sessionActions.pending === "follow-up",
								onClick: () => {
									sessionActions.followUp(followUpPrompt("edit", decoded.prompt, t));
								},
								children: sessionActions.pending === "follow-up" ? t("actionSending") : t("editImage")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionError, {
								visible: sessionActions.failed,
								t
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: decoded.images.flatMap((image, index) => {
							const suffix = image.preview.name ?? String(index + 1);
							const exactOriginal = image.original;
							return [...exactOriginal === void 0 ? [] : [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadButton, {
								onDownload: () => downloadOriginal(sessionId, exactOriginal),
								t,
								label: decoded.images.length === 1 ? t("downloadOriginal") : t("downloadOriginalNamed", { name: exactOriginal.name })
							}, `${image.preview.attachmentId}:original`)], /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadButton, {
								onDownload: async () => {
									triggerDownload(await load(image.preview), image.preview.name ?? t("image"));
								},
								t,
								label: image.original === void 0 ? decoded.images.length === 1 ? t("download") : t("downloadNamed", { name: suffix }) : decoded.images.length === 1 ? t("downloadPreview") : t("downloadPreviewNamed", { name: suffix })
							}, `${image.preview.attachmentId}:preview`)];
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
						style: {
							cursor: "pointer",
							color: "var(--dsw-alias-label-secondary)",
							fontSize: 13
						},
						children: t("imageDetails")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...detail,
							display: "grid",
							gap: 4,
							marginTop: 6
						},
						children: decoded.images.flatMap((image, index) => {
							const preview = image.preview;
							const original = image.original;
							const name = preview.name ?? String(index + 1);
							if (original === void 0) return [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("imageDetail", {
								name,
								format: formatMediaType(preview.mediaType),
								width: preview.width,
								height: preview.height,
								size: formatBytes(preview.bytes)
							}) }, preview.attachmentId)];
							return [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("originalImageDetail", {
								name: original.name,
								format: formatMediaType(original.mediaType),
								width: original.width,
								height: original.height,
								size: formatBytes(original.bytes)
							}) }, `${preview.attachmentId}:original`), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("previewImageDetail", {
								format: formatMediaType(preview.mediaType),
								width: preview.width,
								height: preview.height,
								size: formatBytes(preview.bytes)
							}) }, `${preview.attachmentId}:preview`)];
						})
					})] })
				] })
			});
		}
		//#endregion
		//#region src/version.ts
		const CODEX_CONNECT_VERSION = "0.1.0-alpha.4.27";
		//#endregion
		//#region src/client/OpenAICodexModelsCard.tsx
		/** Compact Models account entry with quota disclosure and shared configuration. */
		const buttonStyle = {
			padding: "6px 14px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 999,
			background: "transparent",
			color: "inherit",
			font: "inherit",
			fontSize: 14,
			cursor: "pointer"
		};
		const secondaryStyle = {
			fontSize: 12,
			lineHeight: "18px",
			color: "var(--dsw-alias-label-secondary)"
		};
		/** Native modality contains keyboard focus and restores it to More settings on close. */
		function ConfigurationDialog({ t, configScope, onClose }) {
			const dialog = (0, react.useRef)(null);
			const titleId = (0, react.useId)();
			(0, react.useEffect)(() => {
				const element = dialog.current;
				element?.showModal();
				return () => {
					element?.close();
				};
			}, []);
			const close = () => {
				dialog.current?.close();
				onClose();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
				ref: dialog,
				"aria-labelledby": titleId,
				onCancel: (event) => {
					event.preventDefault();
					close();
				},
				onKeyDown: (event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						event.preventDefault();
						close();
						return;
					}
					if (event.key !== "Tab") return;
					const focusable = Array.from(event.currentTarget.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary")).filter((element) => element.getClientRects().length > 0);
					const first = focusable[0];
					const last = focusable.at(-1);
					if (first === void 0 || last === void 0) return;
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault();
						last.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first.focus();
					}
				},
				style: {
					boxSizing: "border-box",
					width: "min(720px, calc(100vw - 32px))",
					maxHeight: "calc(100dvh - 32px)",
					overflowY: "auto",
					padding: 20,
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 12,
					background: "var(--dsw-alias-bg-layer-1, white)",
					color: "var(--dsw-alias-label-primary)",
					margin: "auto"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: titleId,
							style: {
								margin: 0,
								fontSize: 18
							},
							children: t("moreSettingsTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle,
							onClick: close,
							children: t("closeSettings")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: secondaryStyle,
						children: t("settingsSaveHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenAICodexConfiguration, {
						t,
						...configScope === void 0 ? {} : { scope: configScope }
					})
				]
			});
		}
		function OpenAICodexModelsCard({ t, account, configScope }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [settingsOpen, setSettingsOpen] = (0, react.useState)(false);
			const detailsId = (0, react.useId)();
			const snapshot = (0, react.useSyncExternalStore)(account.subscribe, account.getSnapshot);
			const { status } = snapshot;
			const label = accountStatusLabel(status.status, t);
			(0, react.useEffect)(() => {
				if (status.status !== "signed-in") setExpanded(false);
			}, [status.status]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 12,
					padding: "12px 14px",
					color: "var(--dsw-alias-label-primary)"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 10
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 14,
									lineHeight: "22px",
									fontWeight: 500
								},
								children: t("modelsProviderName")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									...dotStyle(status.status),
									width: 8,
									height: 8
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								role: "status",
								style: {
									...secondaryStyle,
									flex: 1
								},
								children: label
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...secondaryStyle,
							marginTop: 4
						},
						children: t("modelsProviderSupport")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 12 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountManager, {
							t,
							store: account,
							snapshot,
							compact: true,
							quotaExpanded: expanded,
							quotaControlsId: detailsId,
							onToggleQuota: () => {
								setExpanded(!expanded);
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFeedback, {
						t,
						snapshot
					}),
					expanded && status.status === "signed-in" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: detailsId,
						style: {
							borderTop: "1px solid var(--dsw-alias-border-l2)",
							marginTop: 12,
							paddingTop: 12
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageLimits, {
							t,
							usage: status.usage,
							heading: false,
							...status.quotaError === void 0 ? {} : { quotaError: status.quotaError }
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...secondaryStyle,
							marginTop: 12
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("modelsAccountHelp") }),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									setSettingsOpen(true);
								},
								style: {
									...buttonStyle,
									padding: 0,
									border: 0,
									fontSize: "inherit",
									textDecoration: "underline"
								},
								children: t("moreSettings")
							})
						]
					}),
					settingsOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigurationDialog, {
						t,
						...configScope === void 0 ? {} : { configScope },
						onClose: () => {
							setSettingsOpen(false);
						}
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		/** Stable browser-plugin name. */
		const name = "dsh-codex-connect-client";
		/** Client services required by the Plugin configuration contribution. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"remote.session",
			"settingsScope",
			"sessions"
		];
		/** Register account copy and the OpenAI Codex card under Plugin configuration. */
		function apply(ctx) {
			const namespace = "settings.openai-codex";
			const updater = new OpenAICodexUpdateStore(CODEX_CONNECT_VERSION);
			const account = new OpenAICodexAccountStore();
			ctx.effect(() => () => {
				account.dispose();
			}, "dsh-codex-connect: account observation");
			ctx.effect(() => {
				updater.refresh();
				return () => {
					updater.dispose();
				};
			}, "dsh-codex-connect: update checker");
			ctx.effect(() => ctx.locale.register(namespace, {
				zh,
				en
			}), "dsh-codex-connect: settings copy");
			const t = ctx.locale.bind(namespace);
			const configScope = ctx.settingsScope.bind({
				namespace: OPENAI_CODEX_SETTINGS_NAMESPACE,
				decode: decodeOpenAICodexSettings
			});
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: OPENAI_CODEX_SETTINGS_NAMESPACE,
				inject: () => ({
					t,
					configScope,
					updater,
					account
				})
			}, OpenAICodexPluginCard));
			ctx.slots.inject("settings.models.footer", () => ctx.slots.register({
				name: "settings.models.footer",
				id: "dsh-codex-connect-account",
				order: 100,
				inject: () => ({
					t,
					account,
					configScope
				})
			}, OpenAICodexModelsCard));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "dsh-codex-connect-update",
				order: 40,
				locale: namespace,
				inject: () => ({ updater })
			}, OpenAICodexUpdateOverlay));
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "codex_connect_image_generate",
				locale: namespace,
				inject: () => ({ sessions: ctx.sessions })
			}, CodexImageToolView));
			ctx.inject(["slots", "modelDirectories"], (scope) => {
				scope.slots.inject("conversation.input.right", () => scope.slots.register({
					name: "conversation.input.right",
					id: "openai-codex-fast-mode",
					order: 10,
					locale: namespace,
					inject: (sessionId) => ({ directory: scope.modelDirectories.directoryFor(sessionId).store })
				}, OpenAICodexFastModeToggle));
				scope.slots.inject("conversation.input.right", () => scope.slots.register({
					name: "conversation.input.right",
					id: "openai-codex-quota",
					order: 20,
					locale: namespace,
					inject: (sessionId) => ({ directory: scope.modelDirectories.directoryFor(sessionId).store })
				}, OpenAICodexQuotaIndicator));
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
