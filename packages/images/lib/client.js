window.__ModuleLoader__.load({
	id: "dsh-codex-connect-images",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_attachment = require("@deepseek-ai/dsh-client-ui-attachment");
		//#region src/client/CodexImagesPluginCard.tsx
		const AUTH_STATUS_PATH = "/plugins/dsh-openai-codex/auth/status";
		const card = {
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-module-platform)"
		};
		const header$1 = {
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
		const body = {
			display: "grid",
			gap: 14,
			borderTop: "1px solid var(--dsw-alias-border-l2)",
			padding: "16px 14px 18px",
			color: "var(--dsw-alias-label-primary)",
			fontSize: 13,
			lineHeight: "18px"
		};
		const row = {
			display: "flex",
			justifyContent: "space-between",
			alignItems: "flex-start",
			gap: 16
		};
		const muted = { color: "var(--dsw-alias-label-tertiary)" };
		const warning = {
			padding: 10,
			borderRadius: 8,
			background: "var(--dsw-alias-bg-base)",
			color: "var(--dsw-alias-label-secondary)"
		};
		function Chevron({ open }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				"aria-hidden": "true",
				style: {
					color: "var(--dsw-alias-label-tertiary)",
					transform: open ? "rotate(180deg)" : "none",
					transition: "transform 160ms ease"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
					width: "14",
					height: "14",
					viewBox: "0 0 14 14",
					fill: "none",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
						d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
						fill: "currentColor"
					})
				})
			});
		}
		function authLabel(t, auth) {
			if (auth === "signed-in") return t("signedIn");
			if (auth === "signed-out") return t("signedOut");
			if (auth === "reauth-required") return t("reauth");
			return t("authUnknown");
		}
		function CodexImagesPluginCard({ t, settings }) {
			const [open, setOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [saveError, setSaveError] = (0, react.useState)(false);
			const [auth, setAuth] = (0, react.useState)("loading");
			const snapshot = (0, react.useSyncExternalStore)(settings.subscribe, settings.getSnapshot, settings.getSnapshot);
			const enabled = snapshot.value?.enabled === true;
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				fetch(AUTH_STATUS_PATH, {
					credentials: "same-origin",
					headers: { accept: "application/json" },
					signal: controller.signal
				}).then(async (response) => response.ok ? response.json() : void 0).then((value) => {
					const status = value?.status;
					setAuth(status === "signed-in" || status === "signed-out" || status === "reauth-required" ? status : "unknown");
				}).catch((error) => {
					if (!(error instanceof DOMException && error.name === "AbortError")) setAuth("unknown");
				});
				return () => {
					controller.abort();
				};
			}, []);
			async function toggle() {
				if (!snapshot.writable || snapshot.status !== "ready" || busy) return;
				setBusy(true);
				setSaveError(false);
				try {
					await settings.set("enabled", !enabled);
				} catch {
					setSaveError(true);
				} finally {
					setBusy(false);
				}
			}
			const title = t("title");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				style: card,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					style: header$1,
					"aria-expanded": open,
					"aria-label": `${t(open ? "collapse" : "expand")}: ${title}`,
					onClick: () => {
						setOpen(!open);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							minWidth: 0,
							flexDirection: "column",
							gap: 3
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
							style: {
								fontSize: 14,
								lineHeight: "20px"
							},
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							style: muted,
							children: t("intro")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Chevron, { open })]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: body,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							style: row,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("enabled") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: muted,
									children: t("enabledHelp")
								})
							] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								"aria-label": t("enabled"),
								checked: enabled,
								disabled: !snapshot.writable || snapshot.status !== "ready" || busy,
								onChange: () => {
									toggle();
								}
							})]
						}),
						saveError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							role: "alert",
							children: t("saveFailed")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: row,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("status") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: snapshot.status !== "ready" ? t("unavailable") : enabled ? t("ready") : t("disabled") })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: row,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("authorization") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: authLabel(t, auth) })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: muted,
							children: t("authManaged")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("compatibility") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: muted,
								children: t("compatibilityValue")
							})
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("behavior") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: muted,
								children: t("behaviorValue")
							})
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("disclosure") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: warning,
							children: t("quotaWarning")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: warning,
							children: t("alphaWarning")
						})
					]
				}) : null]
			});
		}
		//#endregion
		//#region src/image-presentation.ts
		const IMAGE_PRESENTATION_KIND = "codex-connect-images";
		const IMAGE_LINE = /^(\d+)\. (image\/(?:png|jpeg|webp)), (\d+)x(\d+) px, (\d+) bytes, attachment (.+)$/u;
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
		/** Decode the durable top-level tool-result metadata without trusting arbitrary session JSON. */
		function decodeImagePresentationMeta(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const candidate = value;
			if (candidate.kind !== "codex-connect-images" || candidate.schemaVersion !== 1 || !Array.isArray(candidate.images) || candidate.images.length < 1 || candidate.images.length > 4) return void 0;
			const images = candidate.images.map(imageRef);
			if (images.some((image) => image === void 0)) return void 0;
			return {
				kind: IMAGE_PRESENTATION_KIND,
				schemaVersion: 1,
				images
			};
		}
		/** Parse only the fixed PR-3 result summary, for nested calls and older replay logs without metadata. */
		function decodeImagePresentationText(text) {
			const lines = text.split("\n");
			const header = /^Generated ([1-4]) images?:$/u.exec(lines[0] ?? "");
			if (header === null || lines.length !== Number(header[1]) + 1) return void 0;
			const images = [];
			for (const [index, line] of lines.slice(1).entries()) {
				const match = IMAGE_LINE.exec(line);
				if (match === null || Number(match[1]) !== index + 1) return void 0;
				const width = Number(match[3]);
				const height = Number(match[4]);
				const bytes = Number(match[5]);
				const attachmentId = match[6];
				const type = match[2];
				if (!positiveSafeInteger(width) || !positiveSafeInteger(height) || !positiveSafeInteger(bytes) || attachmentId === void 0 || attachmentId.length === 0 || !mediaType(type)) return void 0;
				images.push({
					attachmentId,
					mediaType: type,
					width,
					height,
					bytes,
					name: `codex-image-${String(index + 1)}.${type === "image/jpeg" ? "jpg" : type.slice(6)}`
				});
			}
			return {
				kind: IMAGE_PRESENTATION_KIND,
				schemaVersion: 1,
				images
			};
		}
		//#endregion
		//#region src/client/CodexImageToolView.tsx
		const shell = {
			display: "grid",
			gap: 10,
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
		function contentText(content) {
			for (const block of content) if (typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string") return block.text;
		}
		function presentation(block) {
			if (!("kind" in block) || block.kind !== "tool-result" || block.isError) return void 0;
			return decodeImagePresentationMeta(block.meta) ?? decodeImagePresentationText(contentText(block.content) ?? "");
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
					close: t("lightboxClose")
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
				detail: reauth ? t("reauth") : void 0
			};
		}
		function CodexImageToolView({ block, sessionId, t, sessions }) {
			const load = useImageLoader(sessionId, sessions);
			const galleryLabels = (0, react.useMemo)(() => labels(t), [t]);
			if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: shell,
				"aria-label": t("generating"),
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
					})
				]
			});
			if (block.isError) {
				const state = errorState(block, t);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					style: shell,
					role: "status",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: state.title }), state.detail === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: detail,
						children: state.detail
					})]
				});
			}
			const decoded = presentation(block);
			if (decoded === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: shell,
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("completed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: detail,
					children: t("unknownResult")
				})]
			});
			async function download(image) {
				const url = await load(image);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = image.name ?? t("image");
				anchor.rel = "noopener";
				document.body.append(anchor);
				anchor.click();
				anchor.remove();
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: shell,
				"aria-label": t("completed"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: header,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("completed") })
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_attachment.ImageGallery, {
						images: decoded.images.map((attachment) => ({ attachment })),
						load,
						align: "start",
						labels: galleryLabels
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: decoded.images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: action,
							onClick: () => {
								download(image);
							},
							children: decoded.images.length === 1 ? t("download") : t("downloadNamed", { name: image.name ?? String(index + 1) })
						}, image.attachmentId))
					})
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		const en = {
			title: "Codex Connect — Images",
			intro: "Optional image generation through Codex Connect",
			expand: "Expand",
			collapse: "Collapse",
			enabled: "Enable image generation",
			enabledHelp: "When off, new image calls are unavailable. Existing images remain visible.",
			status: "Status",
			ready: "Ready",
			disabled: "Disabled",
			unavailable: "Settings unavailable",
			authorization: "Codex authorization",
			signedIn: "Signed in",
			signedOut: "Not signed in",
			reauth: "Sign in again",
			authUnknown: "Check Codex Connect settings",
			authManaged: "Authorization is managed in the Codex Connect settings card.",
			compatibility: "Compatibility",
			compatibilityValue: "Codex Connect 0.1 Alpha 4.11+ · Transport API 1 · DSH RC7",
			behavior: "Generation behavior",
			behaviorValue: "Usually 13–23 seconds · one PNG · size and style are upstream defaults",
			disclosure: "Images are generated by the Codex upstream endpoint. The upstream decides which model runs; this plugin does not specify it and makes no claim about it.",
			quotaWarning: "Image generation uses additional quota. Canceling only stops the local wait; upstream work may continue and consume quota.",
			alphaWarning: "Community Alpha · unofficial · depends on an unstable upstream endpoint.",
			saveFailed: "The setting could not be saved.",
			generating: "Generating image",
			generatingDetail: "Usually 13–23 seconds. The upstream normally returns one PNG.",
			completed: "Image generated",
			failed: "Image generation failed",
			canceled: "Image generation canceled",
			canceledDetail: "Local waiting stopped. Upstream generation may continue and consume quota.",
			unknownResult: "The image result could not be displayed safely.",
			download: "Download",
			downloadNamed: "Download {name}",
			image: "Generated image",
			open: "Open original image",
			openNamed: "Open {name}",
			loading: "Loading image",
			loadFailed: "Image could not be loaded. Retry",
			lightboxDialog: "Image preview",
			lightboxClose: "Close image preview"
		};
		const zh = {
			title: "Codex Connect — 图片",
			intro: "通过 Codex Connect 提供的可选图片生成功能",
			expand: "展开",
			collapse: "收起",
			enabled: "启用图片生成",
			enabledHelp: "关闭后不再接受新的生图调用，历史图片仍可查看。",
			status: "状态",
			ready: "可以使用",
			disabled: "已关闭",
			unavailable: "设置不可用",
			authorization: "Codex 鉴权",
			signedIn: "已登录",
			signedOut: "未登录",
			reauth: "需要重新登录",
			authUnknown: "请检查 Codex Connect 设置",
			authManaged: "请在 Codex Connect 的设置卡片中管理登录状态。",
			compatibility: "兼容性",
			compatibilityValue: "Codex Connect 0.1 Alpha 4.11+ · Transport API 1 · DSH RC7",
			behavior: "生成行为",
			behaviorValue: "通常需要 13–23 秒 · 返回一张 PNG · 尺寸和风格由上游默认值决定",
			disclosure: "图片由 Codex 上游端点生成。具体使用哪个模型由上游决定，本插件不指定、也不作声明。",
			quotaWarning: "图片生成会额外消耗额度。取消只会停止本地等待，上游仍可能继续生成并消耗额度。",
			alphaWarning: "社区 Alpha · 非官方产品 · 依赖尚不稳定的上游端点。",
			saveFailed: "设置保存失败。",
			generating: "正在生成图片",
			generatingDetail: "通常需要 13–23 秒。上游通常返回一张 PNG。",
			completed: "图片已生成",
			failed: "图片生成失败",
			canceled: "图片生成已取消",
			canceledDetail: "本地等待已停止，上游仍可能继续生成并消耗额度。",
			unknownResult: "无法安全显示这次图片结果。",
			download: "下载",
			downloadNamed: "下载 {name}",
			image: "生成的图片",
			open: "打开原图",
			openNamed: "打开 {name}",
			loading: "正在加载图片",
			loadFailed: "图片加载失败，重试",
			lightboxDialog: "图片预览",
			lightboxClose: "关闭图片预览"
		};
		//#endregion
		//#region src/client/settings-contract.ts
		const IMAGES_SETTINGS_NAMESPACE = "llm-openai-codex-images";
		function decodeImagesSettings(value) {
			if (typeof value !== "object" || value === null || typeof value.enabled !== "boolean") return void 0;
			return { enabled: value.enabled };
		}
		//#endregion
		//#region src/client/index.tsx
		const name = "dsh-codex-connect-images-client";
		const inject = [
			"slots",
			"locale",
			"settingsScope",
			"sessions"
		];
		function apply(ctx) {
			const localeNamespace = "settings.codex-connect-images";
			ctx.effect(() => ctx.locale.register(localeNamespace, {
				zh,
				en
			}), "dsh-codex-connect-images: browser copy");
			const t = ctx.locale.bind(localeNamespace);
			const settings = ctx.settingsScope.bind({
				namespace: IMAGES_SETTINGS_NAMESPACE,
				decode: decodeImagesSettings
			});
			ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
				name: "settings.plugin.item",
				key: IMAGES_SETTINGS_NAMESPACE,
				locale: localeNamespace,
				inject: () => ({
					t,
					settings
				})
			}, CodexImagesPluginCard));
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "codex_connect_image_generate",
				locale: localeNamespace,
				inject: () => ({ sessions: ctx.sessions })
			}, CodexImageToolView));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
