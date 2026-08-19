window.__ModuleLoader__.load({
	id: "dsh-codex-connect-images",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region src/client/index.tsx
		/** Browser entrypoint; the tool phase deliberately registers no UI contribution. */
		/** Stable browser-plugin name. */
		const name = "dsh-codex-connect-images-client";
		/** Client service dependencies arrive with the actual tool view. */
		const inject = [];
		/** Gallery and lightbox registration arrive in their separately reviewed phase. */
		function apply() {}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
