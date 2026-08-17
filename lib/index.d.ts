import z from "@deepseek-ai/schemastery";
import { AuthInteraction, Credential, CredentialInfo, CredentialStore } from "@earendil-works/pi-ai";
import "@deepseek-ai/dsh-tools";
import { WebSearchProvider, WebSearchRequest, WebSearchResult } from "@deepseek-ai/dsh-web";
import { Context } from "@deepseek-ai/cordis";
//#region src/view-image.d.ts
/** Stable Codex tool name. */
declare const VIEW_IMAGE_TOOL_NAME = "view_image";
//#endregion
//#region src/compatibility.d.ts
declare const COMPATIBILITY_SCHEMA_VERSION: 1;
declare const SUPPORTED_NODE_RANGE = "^22.19.0 || >=24.0.0";
declare const SUPPORTED_DSH_PLUGIN_API_VERSION = "0.1.0-rc.6";
declare const SUPPORTED_PI_AI_VERSION = "0.82.1";
declare const PI_AI_PACKAGE = "@earendil-works/pi-ai";
declare const DSH_PLUGIN_API_PACKAGES: readonly ["@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-atomic-write", "@deepseek-ai/dsh-attachment", "@deepseek-ai/dsh-home-paths", "@deepseek-ai/dsh-host-webserver", "@deepseek-ai/dsh-invariants", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@deepseek-ai/dsh-fs", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-settings", "@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-web"];
declare const COMPATIBILITY_PACKAGES: readonly ["@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@earendil-works/pi-ai"];
type CompatibilityPackageName = (typeof COMPATIBILITY_PACKAGES)[number];
type CompatibilityStatus = 'compatible' | 'incompatible' | 'unknown';
interface CompatibilityEntry {
  supported: string;
  installed: string | null;
  status: CompatibilityStatus;
}
interface CompatibilityReport {
  schemaVersion: typeof COMPATIBILITY_SCHEMA_VERSION;
  status: CompatibilityStatus;
  node: CompatibilityEntry;
  packages: Record<CompatibilityPackageName, CompatibilityEntry>;
}
interface CompatibilityEvaluationInput {
  /** Node version to evaluate; defaults to the running process in detectCompatibility. */
  nodeVersion?: string | null;
  /** Alias accepted by callers that already group installed values. */
  node?: string | null;
  /** Installed package versions keyed by package name. */
  packageVersions?: Partial<Record<CompatibilityPackageName, string | null | undefined>>;
  /** Alias accepted by callers that already group installed values. */
  packages?: Partial<Record<CompatibilityPackageName, string | null | undefined>>;
  /** Nested installed values are useful when feeding a captured diagnostic fixture. */
  installed?: {
    node?: string | null;
    packages?: Partial<Record<CompatibilityPackageName, string | null | undefined>>;
  };
}
interface CompatibilityDetectionOptions extends CompatibilityEvaluationInput {
  /** Test seam for package metadata resolution; no package paths are returned. */
  readPackageVersion?: (name: CompatibilityPackageName) => string | null | undefined | Promise<string | null | undefined>;
}
/** Public contract data mirrored by compatibility.json without importing JSON at runtime. */
declare const COMPATIBILITY_CONTRACT: {
  readonly schemaVersion: 1;
  readonly engines: {
    readonly node: "^22.19.0 || >=24.0.0";
  };
  readonly dshPluginApi: {
    readonly version: "0.1.0-rc.6";
    readonly packages: readonly ["@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-atomic-write", "@deepseek-ai/dsh-attachment", "@deepseek-ai/dsh-home-paths", "@deepseek-ai/dsh-host-webserver", "@deepseek-ai/dsh-invariants", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@deepseek-ai/dsh-fs", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-settings", "@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-web"];
  };
  readonly piAi: {
    readonly package: "@earendil-works/pi-ai";
    readonly version: "0.82.1";
  };
};
/** Evaluate a captured set of versions without touching the filesystem. */
declare function evaluateCompatibility(input?: CompatibilityEvaluationInput): CompatibilityReport;
/** Alias for callers that prefer assessment terminology. */
declare const assessCompatibility: typeof evaluateCompatibility;
/** Read installed package metadata and return only versions and statuses. */
declare function detectCompatibility(options?: CompatibilityDetectionOptions): Promise<CompatibilityReport>;
//#endregion
//#region src/doctor.d.ts
/** Inputs that are safe to obtain without booting OAuth. */
interface OpenAICodexDiagnosticOptions {
  /** Credential pathname to inspect through metadata only. */
  credentialPath?: string;
  /** Provider ids already registered in the active Harness context. */
  providerIds?: readonly string[];
  /** Whether the optional standalone search provider is enabled. */
  enableSearch?: boolean;
  /** Whether the optional image tool is enabled. */
  enableImageTool?: boolean;
  /** Optional pure-function seam for compatibility checks in tests/diagnostic callers. */
  compatibilityOptions?: CompatibilityDetectionOptions;
}
interface OpenAICodexDiagnosticReport {
  package: 'dsh-codex-connect';
  version: string;
  node: string;
  credentialFile: {
    path: string;
    state: 'missing' | 'owner-only' | 'permissions-too-broad' | 'not-a-regular-file' | 'unreadable-metadata';
    mode?: string;
  };
  capabilities: {
    modelProvider: true;
    search: boolean;
    imageTool: boolean;
    changesHarnessDefaultModel: false;
    changesHarnessSearchRoute: false;
  };
  providerConflict: boolean;
  compatibility: CompatibilityReport;
  hints: string[];
}
/** Actionable message for legacy/manual `openai-codex` adapter collisions. */
declare function openAICodexConflictMessage(): string;
/** Fail before the generic registry error so the collision has a migration hint. */
declare function assertNoOpenAICodexProviderConflict(providerIds: readonly string[]): void;
/**
 * Inspect only process and filesystem metadata. This function never opens the
 * OAuth document, refreshes a token, or starts an authorization flow.
 */
declare function diagnoseOpenAICodex(options?: OpenAICodexDiagnosticOptions): Promise<OpenAICodexDiagnosticReport>;
//#endregion
//#region src/store.d.ts
/** Provider route and pi-ai provider id owned by this bundle. */
declare const OPENAI_CODEX_PROVIDER = "openai-codex";
/** Basename of the OAuth document inside the Harness home. */
declare const OPENAI_CODEX_AUTH_FILENAME = ".openai-codex-auth.json";
/**
 * Resolve the default OAuth document path.
 * @param dshHome - optional Harness-home override.
 * @returns the absolute owner-only document path.
 */
declare function openAICodexAuthPath(dshHome?: string): string;
/** File-backed pi-ai store scoped to the single OpenAI Codex provider. */
declare class OpenAICodexCredentialStore implements CredentialStore {
  /** Absolute credential document path. */
  readonly filename: string;
  /**
   * @param filename - explicit document path, defaulting under `$DSH_HOME`.
   */
  constructor(filename?: string);
  /** Read and validate the current document without acquiring the writer lock. */
  private readCurrent;
  /** @inheritdoc */
  read(providerId: string): Promise<Credential | undefined>;
  /** @inheritdoc */
  list(): Promise<readonly CredentialInfo[]>;
  /** @inheritdoc */
  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined>;
  /** @inheritdoc */
  delete(providerId: string): Promise<void>;
}
//#endregion
//#region src/usage.d.ts
/** Fixed endpoint used by the official Codex client for ChatGPT rate limits. */
declare const OPENAI_CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
/** One quota window expressed as remaining capacity for direct UI rendering. */
interface OpenAICodexRateLimitWindow {
  /** Percent still available in this window. */
  readonly remainingPercent: number;
  /** Server-declared rolling-window length in seconds. */
  readonly windowSeconds: number;
}
/** One separately metered Codex quota bucket. */
interface OpenAICodexRateLimit {
  /** Stable server feature id. */
  readonly id: string;
  /** Optional server-provided display name. */
  readonly name?: string;
  /** Available rolling windows for this bucket. */
  readonly windows: readonly OpenAICodexRateLimitWindow[];
}
/** Optional exact prepaid-credit balance returned by ChatGPT. */
interface OpenAICodexCredits {
  /** Whether the balance is unmetered. */
  readonly unlimited: boolean;
  /** Exact provider-formatted balance when finite and disclosed. */
  readonly balance?: string;
}
/** Optional exact workspace member spend limit returned by ChatGPT. */
interface OpenAICodexIndividualLimit {
  /** Exact configured limit. */
  readonly limit: string;
  /** Exact amount consumed. */
  readonly used: string;
  /** Exact amount still available. */
  readonly remaining: string;
  /** Percent still available for progress rendering. */
  readonly remainingPercent: number;
}
/** Secret-free quota projection returned to the browser. */
interface OpenAICodexUsage {
  /** Rolling Codex rate-limit buckets. */
  readonly rateLimits: readonly OpenAICodexRateLimit[];
  /** Exact prepaid-credit balance when supported for this account. */
  readonly credits?: OpenAICodexCredits;
  /** Exact workspace member limit when supported for this account. */
  readonly individualLimit?: OpenAICodexIndividualLimit;
}
/**
 * Convert the provider response into the small secret-free object sent to the browser.
 * @param value - opaque JSON returned by the ChatGPT usage endpoint.
 * @returns core and additionally metered quota buckets with remaining percentages.
 */
declare function parseOpenAICodexUsage(value: unknown): OpenAICodexUsage;
/**
 * Read current quota without issuing a model request. OAuth is refreshed through
 * the same provider-native credential lifecycle used by normal Codex turns.
 * @param store - plugin-owned OAuth credential store.
 * @returns current rate-limit buckets safe to expose to the local browser page.
 */
declare function readOpenAICodexRateLimits(store: OpenAICodexCredentialStore): Promise<OpenAICodexUsage>;
//#endregion
//#region src/settings-contract.d.ts
/** Node-free settings contract shared by the Host plugin and browser card. */
/** Stable Harness settings namespace owned by this plugin. */
declare const OPENAI_CODEX_SETTINGS_NAMESPACE = "llm-openai-codex";
/** Search modes accepted by the Codex standalone search endpoint. */
type OpenAICodexSearchMode = 'cached' | 'indexed' | 'live';
/** Search-context sizes accepted by the Codex standalone search endpoint. */
type OpenAICodexSearchContextSize = 'low' | 'medium' | 'high';
/** Default model used by the standalone search endpoint. */
declare const DEFAULT_OPENAI_CODEX_SEARCH_MODEL = "gpt-5.6-sol";
/** Default search mode, matching the official local Codex client. */
declare const DEFAULT_OPENAI_CODEX_SEARCH_MODE: OpenAICodexSearchMode;
/** Default provider search-context size. */
declare const DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE: OpenAICodexSearchContextSize;
/** Default output budget for the standalone search response. */
declare const DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS = 10000;
/** Fully resolved user-editable section presented by Plugin configuration. */
interface OpenAICodexSettingsConfig {
  enableSearch: boolean;
  enableImageTool: boolean;
  searchModel: string;
  searchMode: OpenAICodexSearchMode;
  searchContextSize: OpenAICodexSearchContextSize;
  searchMaxOutputTokens: number;
}
declare const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig>;
/** Fill the schema defaults even when called without Cordis validation. */
declare function resolveOpenAICodexSettings(value: Partial<OpenAICodexSettingsConfig>): OpenAICodexSettingsConfig;
/** Narrow the redacted settings wire payload before it enters React state. */
declare function decodeOpenAICodexSettings(value: unknown): OpenAICodexSettingsConfig | undefined;
//#endregion
//#region src/search.d.ts
/** Stable dsh web-provider id selected by the bundle patch. */
declare const OPENAI_CODEX_SEARCH_PROVIDER = "openai-codex";
/** Trusted first-party Codex base; OAuth credentials never cross to a configured origin. */
declare const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
/** Standalone search endpoint used by the official Codex client. */
declare const OPENAI_CODEX_SEARCH_URL = "https://chatgpt.com/backend-api/codex/alpha/search";
interface SearchRequestBody {
  readonly id: string;
  readonly model: string;
  readonly input: readonly [{
    readonly type: 'message';
    readonly role: 'user';
    readonly content: readonly [{
      readonly type: 'input_text';
      readonly text: string;
    }];
  }];
  readonly commands: {
    readonly search_query: readonly [{
      readonly q: string;
    }];
  };
  readonly settings: {
    readonly search_context_size: OpenAICodexSearchContextSize;
    readonly allowed_callers: readonly ['direct'];
    readonly external_web_access: boolean | 'indexed';
  };
  readonly max_output_tokens: number;
}
/** Exact secret-free request recorded before a standalone search dispatch. */
interface OpenAICodexSearchRequestRecord {
  /** Fixed first-party endpoint. */
  readonly endpoint: typeof OPENAI_CODEX_SEARCH_URL;
  /** Exact JSON body sent to the provider. */
  readonly body: SearchRequestBody;
}
/** Fully resolved provider options. */
interface OpenAICodexSearchProviderOptions {
  /** Shared persistent OAuth store. */
  readonly credentials: OpenAICodexCredentialStore;
  /** Model sent to the standalone search endpoint. */
  readonly model: string;
  /** Cached, indexed, or live external-web policy. */
  readonly mode: OpenAICodexSearchMode;
  /** Provider-side search context size. */
  readonly contextSize: OpenAICodexSearchContextSize;
  /** Upper bound on the standalone endpoint's generated output. */
  readonly maxOutputTokens: number;
  /** Resolve the request identity, normally the initiating session id. */
  readonly resolveRequestId: () => string;
  /** Record the exact secret-free request before dispatch. */
  readonly recordRequest?: (request: OpenAICodexSearchRequestRecord) => void;
}
/**
 * Map the standalone endpoint's forward-compatible result DTOs into the dsh
 * web result. Unknown DTO types and fields are ignored; malformed envelope
 * fields fail at the network boundary.
 * @param value - parsed response JSON.
 * @returns normalized answer and citeable sources.
 */
declare function mapOpenAICodexSearchResponse(value: unknown): WebSearchResult;
/** OpenAI Codex standalone-search provider using the same refreshable OAuth store as the LLM route. */
declare class OpenAICodexSearchProvider implements WebSearchProvider {
  private readonly options;
  readonly id = "openai-codex";
  private readonly models;
  /**
   * @param options - fixed trusted endpoint policy and deployment tunables.
   */
  constructor(options: OpenAICodexSearchProviderOptions);
  /** The local configuration is usable; credential presence is resolved per request. */
  available(): boolean;
  /** @inheritdoc */
  search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult>;
}
//#endregion
//#region src/search-event.d.ts
/** Dedicated log event written before an OpenAI Codex search dispatch. */
declare const OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT = "web/openai-codex-search-llm-request";
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    /** Exact secret-free OpenAI Codex standalone-search request. */
    'web/openai-codex-search-llm-request': OpenAICodexSearchRequestRecord;
  }
}
/**
 * Register the plugin-owned event in the running Harness vocabulary. The
 * public DSH build exports its known-event collection as read-only because
 * core code must not mutate it accidentally; the runtime value is the Set
 * deliberately consulted on every persistence read. Registration remains for
 * the process lifetime so sessions written before an HMR cycle stay readable.
 */
declare function installOpenAICodexSearchEvent(): void;
/**
 * Append one resolved request to the initiating agent's session. Searches
 * outside an agent turn have no owning session and therefore produce no log.
 * @param ctx - plugin context carrying the optional active-agent service.
 * @param request - exact request after defaults, excluding credentials.
 */
declare function recordOpenAICodexSearchRequest(ctx: Context, request: OpenAICodexSearchRequestRecord): void;
//#endregion
//#region src/auth.d.ts
/** Non-secret login state shown by the launcher. */
interface OpenAICodexAuthStatus {
  /** Whether a stored OAuth credential exists. */
  authenticated: boolean;
  /** Access-token expiry time; refresh is automatic on the next request. */
  expiresAt?: Date;
}
/**
 * Complete provider-native OAuth and persist the resulting credential.
 * @param interaction - terminal or UI callbacks for the provider flow.
 * @param store - credential store, defaulting under `$DSH_HOME`.
 */
declare function loginOpenAICodex(interaction: AuthInteraction, store?: OpenAICodexCredentialStore): Promise<void>;
/**
 * Remove the stored OpenAI Codex credential.
 * @param store - credential store, defaulting under `$DSH_HOME`.
 */
declare function logoutOpenAICodex(store?: OpenAICodexCredentialStore): Promise<void>;
/**
 * Read non-secret OpenAI Codex login state without refreshing the token.
 * @param store - credential store, defaulting under `$DSH_HOME`.
 * @returns stored login state and expiry.
 */
declare function openAICodexAuthStatus(store?: OpenAICodexCredentialStore): Promise<OpenAICodexAuthStatus>;
//#endregion
//#region src/index.d.ts
/** Stable Cordis plugin name. */
declare const name = "llm-openai-codex";
/** The model registry required before the provider can register. */
declare const inject: string[];
/** Branded Host settings namespace used by the configurable-provider directory. */
declare const OPENAI_CODEX_SETTINGS_NS: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Composite model and standalone-search configuration. */
interface Config {
  /** Register the optional standalone Codex search provider. */
  enableSearch?: boolean;
  /** Register the optional image-loading tool. */
  enableImageTool?: boolean;
  /** Model used for auxiliary standalone searches. */
  searchModel?: string;
  /** Cached, indexed, or live web access. */
  searchMode?: OpenAICodexSearchMode;
  /** Amount of search context returned by the provider. */
  searchContextSize?: OpenAICodexSearchContextSize;
  /** Maximum generated tokens returned by the standalone search endpoint. */
  searchMaxOutputTokens?: number;
}
declare const Config: z<Config>;
/**
 * Register the `openai-codex` LLM route with one provider-native OAuth store.
 * Search and image tooling are added only when their config flags are true.
 * Selecting this route as the Harness default remains a separate profile choice.
 * @param ctx - plugin context carrying the LLM registry plus optional services.
 * @param config - capability gates and standalone-search tuning.
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { COMPATIBILITY_CONTRACT, COMPATIBILITY_PACKAGES, COMPATIBILITY_SCHEMA_VERSION, type CompatibilityDetectionOptions, type CompatibilityEntry, type CompatibilityEvaluationInput, type CompatibilityPackageName, type CompatibilityReport, type CompatibilityStatus, Config, DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE, DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS, DEFAULT_OPENAI_CODEX_SEARCH_MODE, DEFAULT_OPENAI_CODEX_SEARCH_MODEL, DEFAULT_OPENAI_CODEX_SETTINGS, DSH_PLUGIN_API_PACKAGES, OPENAI_CODEX_AUTH_FILENAME, OPENAI_CODEX_BASE_URL, OPENAI_CODEX_PROVIDER, OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT, OPENAI_CODEX_SEARCH_PROVIDER, OPENAI_CODEX_SEARCH_URL, OPENAI_CODEX_SETTINGS_NAMESPACE, OPENAI_CODEX_SETTINGS_NS, OPENAI_CODEX_USAGE_URL, type OpenAICodexAuthStatus, OpenAICodexCredentialStore, type OpenAICodexCredits, type OpenAICodexDiagnosticOptions, type OpenAICodexDiagnosticReport, type OpenAICodexIndividualLimit, type OpenAICodexRateLimit, type OpenAICodexRateLimitWindow, type OpenAICodexSearchContextSize, type OpenAICodexSearchMode, OpenAICodexSearchProvider, type OpenAICodexSearchProviderOptions, type OpenAICodexSearchRequestRecord, type OpenAICodexSettingsConfig, type OpenAICodexUsage, PI_AI_PACKAGE, SUPPORTED_DSH_PLUGIN_API_VERSION, SUPPORTED_NODE_RANGE, SUPPORTED_PI_AI_VERSION, VIEW_IMAGE_TOOL_NAME, apply, assertNoOpenAICodexProviderConflict, assessCompatibility, decodeOpenAICodexSettings, detectCompatibility, diagnoseOpenAICodex, evaluateCompatibility, inject, installOpenAICodexSearchEvent, loginOpenAICodex, logoutOpenAICodex, mapOpenAICodexSearchResponse, name, openAICodexAuthPath, openAICodexAuthStatus, openAICodexConflictMessage, parseOpenAICodexUsage, readOpenAICodexRateLimits, recordOpenAICodexSearchRequest, resolveOpenAICodexSettings };