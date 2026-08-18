window.__ModuleLoader__.load({
	id: "dsh-codex-connect",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/settings-contract.ts
		/** Node-free settings contract shared by the Host plugin and browser card. */
		/** Stable Harness settings namespace owned by this plugin. */
		const OPENAI_CODEX_SETTINGS_NAMESPACE = "llm-openai-codex";
		Object.freeze({
			enableSearch: false,
			enableImageTool: false,
			searchModel: "gpt-5.6-sol",
			searchMode: "cached",
			searchContextSize: "medium",
			searchMaxOutputTokens: 1e4
		});
		function isRecord$2(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/** Narrow the redacted settings wire payload before it enters React state. */
		function decodeOpenAICodexSettings(value) {
			if (!isRecord$2(value)) return void 0;
			const enableSearch = value["enableSearch"];
			const enableImageTool = value["enableImageTool"];
			const searchModel = value["searchModel"];
			const searchMode = value["searchMode"];
			const searchContextSize = value["searchContextSize"];
			const searchMaxOutputTokens = value["searchMaxOutputTokens"];
			if (typeof enableSearch !== "boolean" || typeof enableImageTool !== "boolean") return void 0;
			if (typeof searchModel !== "string" || searchModel.trim().length === 0) return void 0;
			if (searchMode !== "cached" && searchMode !== "indexed" && searchMode !== "live") return void 0;
			if (searchContextSize !== "low" && searchContextSize !== "medium" && searchContextSize !== "high") return void 0;
			if (typeof searchMaxOutputTokens !== "number" || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return void 0;
			return {
				enableSearch,
				enableImageTool,
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
		//#endregion
		//#region src/client/OpenAICodexConfiguration.tsx
		/** Staged optional-capability editor inside the OpenAI Codex plugin card. */
		const sectionStyle = {
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
		const bodyStyle$1 = {
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
		const buttonStyle$1 = {
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
		const primaryButtonStyle$1 = {
			...buttonStyle$1,
			borderColor: "var(--dsw-alias-brand-primary)",
			background: "var(--dsw-alias-brand-primary)",
			color: "white"
		};
		const errorStyle$1 = {
			...bodyStyle$1,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const successStyle = {
			...bodyStyle$1,
			color: "var(--dsw-alias-state-success-primary, #16825d)"
		};
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
			"enableSearch",
			"enableImageTool",
			"searchModel",
			"searchMode",
			"searchContextSize",
			"searchMaxOutputTokens"
		];
		function sameConfig(left, right) {
			return left !== void 0 && right !== void 0 && CONFIG_FIELDS.every((field) => left[field] === right[field]);
		}
		/** Edit the Host-owned llm-openai-codex settings section with Save/Discard staging. */
		function OpenAICodexConfiguration({ scope, t }) {
			const subscribe = (0, react.useCallback)((listener) => scope?.subscribe(listener) ?? (() => void 0), [scope]);
			const getSnapshot = (0, react.useCallback)(() => scope?.getSnapshot() ?? UNAVAILABLE_SNAPSHOT, [scope]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
			const [draft, setDraft] = (0, react.useState)(snapshot.value);
			const [dirty, setDirty] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [feedback, setFeedback] = (0, react.useState)("idle");
			(0, react.useEffect)(() => {
				if (!dirty && !busy) setDraft(snapshot.value);
			}, [
				busy,
				dirty,
				snapshot.revision,
				snapshot.value
			]);
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
			};
			const validModel = draft !== void 0 && draft.searchModel.trim().length > 0;
			const validTokens = draft !== void 0 && Number.isInteger(draft.searchMaxOutputTokens) && draft.searchMaxOutputTokens > 0;
			const valid = validModel && validTokens;
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
						if (scope.getSnapshot().value?.[field] === desired[field]) continue;
						await scope.set(field, desired[field]);
						if (scope.getSnapshot().value?.[field] !== desired[field]) throw new Error(`Host refused ${field}`);
					}
					const accepted = scope.getSnapshot().value;
					if (!sameConfig(accepted, desired)) throw new Error("Host returned a different configuration");
					setDraft(accepted);
					setDirty(false);
					setFeedback("saved");
				} catch {
					setDraft(scope.getSnapshot().value);
					setDirty(false);
					setFeedback("error");
				} finally {
					setBusy(false);
				}
			};
			const loading = snapshot.status === "loading";
			const editable = snapshot.status === "ready" && snapshot.writable && !busy;
			const searchDisabled = !editable || draft?.enableSearch !== true;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: sectionStyle,
				"aria-labelledby": "openai-codex-capabilities-title",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						id: "openai-codex-capabilities-title",
						style: headingStyle,
						children: t("capabilitiesHeading")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: {
							...bodyStyle$1,
							marginTop: 4
						},
						children: t("capabilitiesIntro")
					})] }),
					loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle$1,
						role: "status",
						children: t("settingsLoading")
					}) : null,
					snapshot.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$1,
						role: "alert",
						children: t("settingsUnavailable")
					}) : null,
					snapshot.status === "ready" && !snapshot.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$1,
						role: "alert",
						children: t("settingsReadOnly")
					}) : null,
					draft === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
						style: fieldsetStyle,
						disabled: !editable,
						children: [
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
										style: bodyStyle$1,
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
										style: bodyStyle$1,
										children: t("enableImageToolHelp")
									})]
								})]
							})
						]
					}),
					!validModel && draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$1,
						role: "alert",
						children: t("invalidSearchModel")
					}) : null,
					!validTokens && draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$1,
						role: "alert",
						children: t("invalidSearchTokens")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle$1,
						children: t("routingNote")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: actionsStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							"aria-live": "polite",
							children: [feedback === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: successStyle,
								children: t("settingsSaved")
							}) : null, feedback === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: errorStyle$1,
								children: t("settingsSaveFailed")
							}) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: buttonsStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle$1,
								disabled: !dirty || busy,
								onClick: discard,
								children: t("discard")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: primaryButtonStyle$1,
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
		//#endregion
		//#region src/client/OpenAICodexSettings.tsx
		/** Plugin-owned OpenAI Codex account controls used inside Plugin configuration. */
		const POLL_INTERVAL_MS = 1e3;
		const USAGE_POLL_INTERVAL_MS$1 = 6e4;
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
		const buttonStyle = {
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
			...buttonStyle,
			borderColor: "var(--dsw-alias-brand-primary)",
			background: "var(--dsw-alias-brand-primary)",
			color: "white"
		};
		const errorStyle = {
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
		function UsageLimits({ usage, quotaError, t }) {
			const hasData = usage.rateLimits.length > 0 || usage.credits !== void 0 || usage.individualLimit !== void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: quotaListStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: quotaTitleStyle,
						children: t("usageLimits")
					}),
					usage.rateLimits.map((limit) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: quotaGroupStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
							style: quotaTitleStyle,
							children: limit.name ?? limit.id
						}), limit.windows.map((window) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBar, {
							label: windowLabel(window.windowSeconds, t),
							percent: window.remainingPercent,
							detail: t("resetAt", { time: formatOpenAICodexResetAt(window.resetAt) ?? t("resetUnavailable") }),
							t
						}, window.windowSeconds))]
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
						style: errorStyle,
						children: t("quotaUnavailable")
					})
				]
			});
		}
		function dotStyle(status) {
			return {
				width: 9,
				height: 9,
				borderRadius: "50%",
				flex: "0 0 auto",
				background: status === "signed-in" ? "var(--dsw-alias-state-success-primary, #22a06b)" : status === "error" || status === "reauth-required" || status === "remote-web-origin-not-trusted" ? "var(--dsw-alias-state-error-primary, #d92d20)" : status === "signing-in" || status === "loading" ? "var(--dsw-alias-brand-primary, #1677ff)" : "var(--dsw-alias-label-dimmed, #9aa0a6)"
			};
		}
		var AccountRequestError = class extends Error {
			code;
			constructor(code, message) {
				super(message);
				this.code = code;
				this.name = "AccountRequestError";
			}
		};
		async function jsonRequest(path, method = "GET", signal) {
			const response = await fetch(path, {
				method,
				headers: { accept: "application/json" },
				credentials: "same-origin",
				...signal === void 0 ? {} : { signal }
			});
			const value = await response.json().catch(() => void 0);
			if (!response.ok) {
				const code = typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : `HTTP ${response.status}`;
				throw new AccountRequestError(code, code);
			}
			return value;
		}
		/** OpenAI Codex account status and OAuth actions. */
		function OpenAICodexSettings({ t, configScope, embedded = false }) {
			if (t === void 0) throw new Error("OpenAI Codex settings requires its translation function");
			const [status, setStatus] = (0, react.useState)({ status: "loading" });
			const [busy, setBusy] = (0, react.useState)(false);
			const [copied, setCopied] = (0, react.useState)(false);
			const [copyFailed, setCopyFailed] = (0, react.useState)(false);
			const mounted = (0, react.useRef)(true);
			const trustedOriginCommand = `dsh plugin --profile web exec dsh-codex-connect trust-origin ${window.location.origin}`;
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			const refresh = (0, react.useCallback)(async (signal) => {
				try {
					const nextStatus = await jsonRequest(OPENAI_CODEX_AUTH_STATUS_PATH, "GET", signal);
					if (mounted.current && signal?.aborted !== true) setStatus(nextStatus);
				} catch (error) {
					if (mounted.current && signal?.aborted !== true) setStatus(error instanceof AccountRequestError && error.code === "remote-web-origin-not-trusted" ? { status: "remote-web-origin-not-trusted" } : {
						status: "error",
						message: error instanceof Error ? error.message : t("requestFailed")
					});
				}
			}, [t]);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				refresh(controller.signal);
				return () => {
					controller.abort();
				};
			}, [refresh]);
			(0, react.useEffect)(() => {
				const interval = status.status === "signing-in" ? POLL_INTERVAL_MS : status.status === "signed-in" ? USAGE_POLL_INTERVAL_MS$1 : void 0;
				if (interval === void 0) return;
				const controller = new AbortController();
				const timer = window.setInterval(() => {
					refresh(controller.signal);
				}, interval);
				return () => {
					window.clearInterval(timer);
					controller.abort();
				};
			}, [refresh, status.status]);
			const signIn = async () => {
				const popup = window.open("about:blank", "_blank");
				if (popup === null) {
					setStatus({
						status: "error",
						message: t("popupBlocked")
					});
					return;
				}
				popup.opener = null;
				setBusy(true);
				setStatus({ status: "signing-in" });
				try {
					const challenge = await jsonRequest(OPENAI_CODEX_AUTH_LOGIN_PATH, "POST");
					if (!mounted.current) {
						popup.close();
						return;
					}
					popup.location.replace(challenge.url);
				} catch (error) {
					popup?.close();
					if (mounted.current) setStatus(error instanceof AccountRequestError && error.code === "remote-web-origin-not-trusted" ? { status: "remote-web-origin-not-trusted" } : {
						status: "error",
						message: error instanceof Error ? error.message : t("requestFailed")
					});
				} finally {
					if (mounted.current) setBusy(false);
				}
			};
			const copyTrustedOriginCommand = async () => {
				setCopyFailed(false);
				try {
					if (navigator.clipboard?.writeText === void 0) throw new Error("clipboard unavailable");
					await navigator.clipboard.writeText(trustedOriginCommand);
					if (mounted.current) setCopied(true);
				} catch {
					if (mounted.current) setCopyFailed(true);
				}
			};
			const signOut = async () => {
				setBusy(true);
				try {
					await jsonRequest(OPENAI_CODEX_AUTH_LOGOUT_PATH, "POST");
					if (mounted.current) setStatus({ status: "signed-out" });
				} catch (error) {
					if (mounted.current) setStatus({
						status: "error",
						message: error instanceof Error ? error.message : t("requestFailed")
					});
				} finally {
					if (mounted.current) setBusy(false);
				}
			};
			const label = status.status === "signed-in" ? t("signedIn") : status.status === "loading" ? t("loadingAccount") : status.status === "signing-in" ? t("signingIn") : status.status === "reauth-required" ? t("reauthRequired") : status.status === "remote-web-origin-not-trusted" ? t("remoteOriginTitle") : status.status === "error" ? t("requestFailed") : t("signedOut");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: embedded ? embeddedPageStyle : pageStyle,
				...embedded ? { "aria-label": t("title") } : { "aria-labelledby": "openai-codex-settings-title" },
				children: [embedded ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
					id: "openai-codex-settings-title",
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
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							style: quotaTitleStyle,
							children: t("accountHeading")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: rowStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: statusStyle,
								role: "status",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									style: dotStyle(status.status)
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label })]
							}), status.status === "loading" || status.status === "remote-web-origin-not-trusted" ? null : status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle,
								disabled: busy,
								onClick: () => {
									signOut();
								},
								children: busy ? t("working") : t("logout")
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: primaryButtonStyle,
								disabled: busy,
								onClick: () => {
									signIn();
								},
								children: busy ? t("working") : status.status === "error" || status.status === "reauth-required" ? t("loginAgain") : t("login")
							})]
						}),
						status.status === "error" || status.status === "reauth-required" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: errorStyle,
							children: status.message
						}) : null,
						status.status === "remote-web-origin-not-trusted" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: 10
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									style: errorStyle,
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
										style: buttonStyle,
										onClick: () => {
											copyTrustedOriginCommand();
										},
										children: copied ? t("remoteOriginCopied") : t("remoteOriginCopy")
									}), copyFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: errorStyle,
										children: t("remoteOriginCopyFailed")
									}) : null]
								})
							]
						}) : null,
						status.status === "signed-in" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageLimits, {
							usage: status.usage,
							...status.quotaError === void 0 ? {} : { quotaError: status.quotaError },
							t
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenAICodexConfiguration, {
							t,
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
			borderRadius: 10,
			background: "var(--dsw-alias-bg-module-platform)"
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
		function OpenAICodexPluginCard({ t, configScope }) {
			if (t === void 0) throw new Error("OpenAI Codex plugin card requires its translation function");
			const [open, setOpen] = (0, react.useState)(false);
			const title = t("title");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: cardStyle,
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
						embedded: true,
						...configScope === void 0 ? {} : { configScope }
					})
				}) : null]
			});
		}
		//#endregion
		//#region src/client/OpenAICodexQuotaIndicator.tsx
		/** Compact weekly Codex quota indicator for the Composer tool row. */
		const WEEK_SECONDS = 604800;
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
		function weeklyQuotaOf(usage, model) {
			const quotaId = model === SPARK_MODEL ? SPARK_QUOTA_ID : "codex";
			return usage.rateLimits.find((limit) => limit.id === quotaId)?.windows.find((window) => window.windowSeconds === WEEK_SECONDS);
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
		/** Render nothing until an eligible GPT Codex session has a usable weekly quota. */
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
			const weekly = weeklyQuotaOf(request.usage, directoryState.current?.model);
			if (weekly === void 0) return null;
			const summary = t("composerWeeklyQuotaSummary", {
				percent: formatPercent(weekly.remainingPercent),
				time: formatOpenAICodexResetAt(weekly.resetAt) ?? t("resetUnavailable")
			});
			const boundedPercent = boundedQuotaPercent(weekly.remainingPercent);
			const progressColor = quotaProgressColor(weekly.remainingPercent);
			const tooltipVisible = isHovered || isFocused;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				role: "status",
				"data-openai-codex-quota": "weekly",
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
					width: `${QUOTA_PROGRESS_WIDTH_PX}px`,
					height: "28px",
					position: "relative",
					alignItems: "center",
					justifyContent: "center"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					"aria-hidden": "true",
					"data-openai-codex-quota-track": "weekly",
					style: {
						display: "block",
						width: `${QUOTA_PROGRESS_WIDTH_PX}px`,
						height: `${QUOTA_PROGRESS_TRACK_HEIGHT_PX}px`,
						borderRadius: "999px",
						backgroundColor: "var(--dsw-alias-border-l2)",
						overflow: "hidden"
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						"data-openai-codex-quota-progress": "weekly",
						"data-openai-codex-quota-color": progressColor.name,
						style: {
							display: "block",
							width: `${boundedPercent}%`,
							height: "100%",
							borderRadius: "inherit",
							backgroundColor: progressColor.value
						}
					})
				}), tooltipVisible ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					id: tooltipId,
					role: "tooltip",
					"data-openai-codex-quota-tooltip": "weekly",
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
			intro: "Use your ChatGPT subscription in dsh without an API key.",
			accountHeading: "ChatGPT account",
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
			usageLimits: "Usage limits",
			fiveHourLimit: "5-hour limit",
			weeklyLimit: "Weekly limit",
			hourLimit: "{count}-hour limit",
			usageWindow: "Usage window",
			percentRemaining: "{percent}% remaining",
			resetAt: "Resets {time}",
			resetUnavailable: "Reset time unavailable",
			composerWeeklyQuota: "Codex weekly quota",
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
			capabilitiesHeading: "Optional capabilities",
			capabilitiesIntro: "Choose which extra Codex capabilities this dsh profile may register.",
			enableSearch: "Enable Codex search provider",
			enableSearchHelp: "Makes OpenAI Codex available as a search provider. It does not select the global search route.",
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
			routingNote: "These settings never change the default model or the profile’s global search route.",
			settingsLoading: "Loading plugin settings…",
			settingsUnavailable: "Plugin settings are unavailable in this dsh profile.",
			settingsReadOnly: "This profile exposes plugin settings as read-only.",
			invalidSearchModel: "Enter a search model.",
			invalidSearchTokens: "Maximum search output tokens must be a positive whole number.",
			save: "Save changes",
			saving: "Saving…",
			discard: "Discard",
			settingsSaved: "Saved",
			settingsSaveFailed: "The settings could not be saved. The current Host values were restored."
		};
		/** Chinese copy for the OpenAI Codex Plugin configuration card. */
		const zh = {
			title: "Codex Connect",
			intro: "使用 ChatGPT 订阅在 dsh 中调用模型，无需 API Key。",
			accountHeading: "ChatGPT 账户",
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
			usageLimits: "使用额度",
			fiveHourLimit: "5 小时额度",
			weeklyLimit: "每周额度",
			hourLimit: "{count} 小时额度",
			usageWindow: "使用额度",
			percentRemaining: "剩余 {percent}%",
			resetAt: "{time} 重置",
			resetUnavailable: "重置时间不可用",
			composerWeeklyQuota: "Codex 周额度",
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
			capabilitiesHeading: "可选能力",
			capabilitiesIntro: "选择允许此 dsh profile 注册哪些额外的 Codex 能力。",
			enableSearch: "启用 Codex 搜索提供方",
			enableSearchHelp: "让 OpenAI Codex 可被选作搜索提供方，但不会自动改动全局搜索路由。",
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
			routingNote: "这些设置绝不会改动默认模型，也不会接管此 profile 的全局搜索路由。",
			settingsLoading: "正在加载插件设置…",
			settingsUnavailable: "此 dsh profile 无法使用插件设置。",
			settingsReadOnly: "此 profile 的插件设置为只读。",
			invalidSearchModel: "请输入搜索模型。",
			invalidSearchTokens: "搜索最大输出 Tokens 必须是正整数。",
			save: "保存更改",
			saving: "正在保存…",
			discard: "放弃更改",
			settingsSaved: "已保存",
			settingsSaveFailed: "设置未能保存，已恢复 Host 当前值。"
		};
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
			"settingsScope"
		];
		/** Register account copy and the OpenAI Codex card under Plugin configuration. */
		function apply(ctx) {
			const namespace = "settings.openai-codex";
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
					configScope
				})
			}, OpenAICodexPluginCard));
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
