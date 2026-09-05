import z from "@deepseek-ai/schemastery";
import { AuthInteraction, Credential, CredentialInfo, CredentialStore, OAuthCredential } from "@earendil-works/pi-ai";
import "@deepseek-ai/dsh-tools";
import { Context, Service } from "@deepseek-ai/cordis";
import { WebSearchProvider, WebSearchRequest, WebSearchResult } from "@deepseek-ai/dsh-web";
//#region src/account-profile.d.ts
type OpenAICodexAccountProfileSource = 'oauth' | 'generated';
//#endregion
//#region src/store.d.ts
/** Provider route and pi-ai provider id owned by this bundle. */
declare const OPENAI_CODEX_PROVIDER = "openai-codex";
/** Basename of the OAuth document inside the Harness home. */
declare const OPENAI_CODEX_AUTH_FILENAME = ".openai-codex-auth.json";
/** Maximum number of stored OpenAI Codex accounts. */
declare const OPENAI_CODEX_ACCOUNT_LIMIT = 16;
/** Maximum serialized credential document size. */
declare const OPENAI_CODEX_AUTH_DOCUMENT_LIMIT: number;
/** Suffix used for the one-time version-1 rollback copy. */
declare const OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX = ".v1-backup";
interface OpenAICodexAccountSummary {
  accountKey: string;
  displayName: string;
  maskedEmail?: string;
  profileSource: OpenAICodexAccountProfileSource;
  active: boolean;
}
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
  /** Owner-only version-1 rollback copy, created at the first migration write. */
  readonly version1BackupFilename: string;
  /**
   * @param filename - explicit document path, defaulting under `$DSH_HOME`.
   */
  constructor(filename?: string);
  /** Read and validate the current document without acquiring the writer lock. */
  private readDocument;
  private readDocumentAt;
  private writeDocument;
  /** @inheritdoc */
  read(providerId: string): Promise<Credential | undefined>;
  /**
   * Capture the current account for one request's complete auth resolution.
   * Refreshes through the returned store update only that captured account and
   * never change the user's current account selection.
   */
  captureActiveAccount(): Promise<CredentialStore>;
  private modifyCapturedAccount;
  /** @inheritdoc */
  list(): Promise<readonly CredentialInfo[]>;
  /** List browser-safe account summaries without exposing provider account ids. */
  accounts(): Promise<readonly OpenAICodexAccountSummary[]>;
  /** Resolve the account id stored with one exact access token. */
  accountIdForAccess(access: string): Promise<string | undefined>;
  /** Select a stored account using its browser-safe key. */
  activate(selectedAccountKey: string): Promise<OAuthCredential>;
  /** Remove one account; active removal requires an explicit stored replacement. */
  removeAccount(selectedAccountKey: string, replacementAccountKey?: string): Promise<void>;
  /** @inheritdoc */
  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined>;
  /** @inheritdoc */
  delete(providerId: string): Promise<void>;
}
//#endregion
//#region src/provider-proxy.d.ts
/** Explicit Codex-only HTTP(S) proxying, probing, and lifecycle ownership. */
/** Canonical first-party endpoint used for a no-auth, no-model reachability probe. */
declare const OPENAI_CODEX_PROXY_PROBE_URL = "https://chatgpt.com/backend-api/codex";
/** Upper bound for one candidate probe, including CONNECT and response headers. */
declare const OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS = 3000;
/** Maximum number of candidates considered by automatic detection. */
declare const OPENAI_CODEX_PROXY_CANDIDATE_LIMIT = 8;
/** Bounded local candidates documented by the settings UI. */
declare const OPENAI_CODEX_LOCAL_PROXY_CANDIDATES: readonly ["http://127.0.0.1:7890", "http://127.0.0.1:7897", "http://127.0.0.1:10809"];
/** Stable probe classifications safe to display in the browser. */
type OpenAICodexProxyProbeClassification = 'reachable' | 'upstream-authentication-required' | 'proxy-authentication-required' | 'dns-failure' | 'connection-refused' | 'timeout' | 'tls-failure' | 'connect-failure' | 'invalid';
/** Result of testing one proxy origin. */
interface OpenAICodexProxyProbeResult {
  /** Canonical proxy origin tested. */
  proxyUrl: string;
  /** Whether the proxy returned any HTTP response from the probe origin. */
  reachable: boolean;
  /** Bounded category for a UI troubleshooting message. */
  classification: OpenAICodexProxyProbeClassification;
  /** Upstream or proxy status, when an HTTP response was received. */
  status?: number;
}
/** Return a small, deterministic candidate set; this never scans LAN hosts or ports. */
declare function listOpenAICodexProxyCandidates(): readonly string[];
/** One plugin instance owns its proxy agents and contributes one global wrapper owner. */
declare class OpenAICodexProxyManager {
  private readonly agents;
  private activeOperations;
  private idleWaiters;
  private disposed;
  private disposePromise;
  private waitForIdle;
  private closeAgents;
  private agentFor;
  private acquire;
  /** Run a synchronous or asynchronous Codex operation in the selected proxy scope. */
  run<T>(proxyUrl: string | undefined, operation: () => T): T;
  /** Run a streaming operation and keep the proxy lease until its final event. */
  runStream<T extends {
    result(): Promise<unknown>;
  }>(proxyUrl: string | undefined, operation: () => T): T;
  /** Probe one proxy without credentials, model calls, quota calls, or settings writes. */
  probe(proxyUrl: string): Promise<OpenAICodexProxyProbeResult>;
  /** Close owned pools only after all scoped operations have become quiescent. */
  dispose(): Promise<void>;
  /** Release the process wrapper and pools after the user disables the proxy. */
  deactivate(): Promise<void>;
}
/** Probe the bounded automatic candidate set in parallel. */
declare function detectOpenAICodexProxies(manager: OpenAICodexProxyManager): Promise<readonly OpenAICodexProxyProbeResult[]>;
//#endregion
//#region src/transport.d.ts
/** Cordis service name owned by the core plugin fiber. */
declare const OPENAI_CODEX_TRANSPORT_SERVICE = "openaiCodexTransport";
/** Structured contract version used across the core and companion packages. */
declare const OPENAI_CODEX_TRANSPORT_API_VERSION: 1;
/** Stage-zero verified image-generation endpoint. */
declare const OPENAI_CODEX_IMAGE_GENERATION_URL = "https://chatgpt.com/backend-api/codex/images/generations";
/** Network deadline covering the request and bounded response read. */
declare const OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS = 120000;
/** Maximum accepted success-body size: 48 MiB. */
declare const OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES: number;
/** Maximum error-body size read and discarded: 64 KiB. */
declare const OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES: number;
/** Defensive upper bound for unexpected multi-image responses. */
declare const OPENAI_CODEX_IMAGE_MAX_COUNT = 4;
/** Local prompt limit enforced before any credential or network work. */
declare const OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH = 32000;
/** Stable, secret-free transport errors consumed structurally by companion packages. */
declare const OPENAI_CODEX_TRANSPORT_ERROR_CODES: {
  readonly invalidRequest: "OPENAI_CODEX_INVALID_REQUEST";
  readonly signedOut: "OPENAI_CODEX_SIGNED_OUT";
  readonly reauthRequired: "OPENAI_CODEX_REAUTH_REQUIRED";
  readonly rateLimited: "OPENAI_CODEX_RATE_LIMITED";
  readonly upstreamRejected: "OPENAI_CODEX_UPSTREAM_REJECTED";
  readonly upstreamUnavailable: "OPENAI_CODEX_UPSTREAM_UNAVAILABLE";
  readonly redirectRejected: "OPENAI_CODEX_REDIRECT_REJECTED";
  readonly timeout: "OPENAI_CODEX_TIMEOUT";
  readonly canceled: "OPENAI_CODEX_CANCELED";
  readonly networkError: "OPENAI_CODEX_NETWORK_ERROR";
  readonly responseTooLarge: "OPENAI_CODEX_RESPONSE_TOO_LARGE";
  readonly malformedResponse: "OPENAI_CODEX_MALFORMED_RESPONSE";
};
/** Union of the stable transport error codes. */
type OpenAICodexTransportErrorCode = (typeof OPENAI_CODEX_TRANSPORT_ERROR_CODES)[keyof typeof OPENAI_CODEX_TRANSPORT_ERROR_CODES];
/** Fixed, secret-free transport failure. */
declare class OpenAICodexTransportError extends Error {
  readonly code: OpenAICodexTransportErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  constructor(code: OpenAICodexTransportErrorCode, options?: {
    status?: number;
    retryAfterSeconds?: number;
  });
}
/** Identify transport failures structurally without relying on cross-package class identity. */
declare function isOpenAICodexTransportError(error: unknown): error is OpenAICodexTransportError;
/** Only caller-controlled field accepted by the Host transport. */
interface ImageGenerationRequest {
  readonly prompt: string;
}
/** Request lifecycle supplied by the Host tool in PR-3. */
interface ImageRequestContext {
  readonly signal?: AbortSignal | undefined;
}
/** One encoded image awaiting PR-3 signature and attachment validation. */
interface GeneratedImagePayload {
  readonly b64Json: string;
}
/** Bounded, structured success projection returned to the companion package. */
interface ImageGenerationResponse {
  readonly apiVersion: 1;
  readonly traceId: string;
  readonly elapsedMs: number;
  readonly responseBytes: number;
  readonly images: readonly GeneratedImagePayload[];
}
/** Versioned Host-only API provided by the core plugin. */
interface OpenAICodexTransportV1 {
  readonly apiVersion: 1;
  generateImages(input: ImageGenerationRequest, context: ImageRequestContext): Promise<ImageGenerationResponse>;
}
/** Core-owned Cordis service for the optional image package. */
declare class OpenAICodexTransport extends Service implements OpenAICodexTransportV1 {
  private readonly credentials;
  private readonly proxyManager?;
  private readonly resolveProxyUrl;
  readonly apiVersion: 1;
  private readonly models;
  constructor(ctx: Context, credentials: OpenAICodexCredentialStore, proxyManager?: OpenAICodexProxyManager | undefined, resolveProxyUrl?: () => string | undefined);
  generateImages(input: ImageGenerationRequest, context: ImageRequestContext): Promise<ImageGenerationResponse>;
  private generateImagesWithoutProxy;
}
//#endregion
//#region src/view-image.d.ts
/** Stable Codex tool name. */
declare const VIEW_IMAGE_TOOL_NAME = "view_image";
//#endregion
//#region src/image-tool.d.ts
/** Stable model-callable tool name. */
declare const IMAGE_GENERATE_TOOL_NAME = "codex_connect_image_generate";
//#endregion
//#region src/compatibility.d.ts
declare const COMPATIBILITY_SCHEMA_VERSION: 1;
declare const SUPPORTED_NODE_RANGE = "^22.19.0 || >=24.0.0";
declare const SUPPORTED_DSH_PLUGIN_API_VERSION = "0.1.2-rc.1";
declare const SUPPORTED_PI_AI_RANGE = "^0.84.2";
declare const PI_AI_PACKAGE = "@earendil-works/pi-ai";
declare const DSH_PLUGIN_API_PACKAGES: readonly ["@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-atomic-write", "@deepseek-ai/dsh-attachment", "@deepseek-ai/dsh-home-paths", "@deepseek-ai/dsh-host-webserver", "@deepseek-ai/dsh-invariants", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@deepseek-ai/dsh-fs", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-settings", "@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-util-values", "@deepseek-ai/dsh-web"];
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
    readonly version: "0.1.2-rc.1";
    readonly packages: readonly ["@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-atomic-write", "@deepseek-ai/dsh-attachment", "@deepseek-ai/dsh-home-paths", "@deepseek-ai/dsh-host-webserver", "@deepseek-ai/dsh-invariants", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@deepseek-ai/dsh-fs", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-settings", "@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-util-values", "@deepseek-ai/dsh-web"];
  };
  readonly piAi: {
    readonly package: "@earendil-works/pi-ai";
    readonly version: "^0.84.2";
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
  /** Whether the optional image generation tool is enabled. */
  enableImageGeneration?: boolean;
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
    imageGeneration: boolean;
    changesHarnessDefaultModel: false;
    changesHarnessSearchRoute: boolean;
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
//#region src/usage.d.ts
/** Fixed endpoint used by the official Codex client for ChatGPT rate limits. */
declare const OPENAI_CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
/** One quota window expressed as remaining capacity for direct UI rendering. */
interface OpenAICodexRateLimitWindow {
  /** Percent still available in this window. */
  readonly remainingPercent: number;
  /** Server-declared rolling-window length in seconds. */
  readonly windowSeconds: number;
  /** Server-declared reset time as Unix seconds, when supplied and valid. */
  readonly resetAt?: number;
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
/** Suggested local HTTP proxy shown by the settings UI; it is never enabled by default. */
declare const DEFAULT_OPENAI_CODEX_PROXY_URL = "http://127.0.0.1:7890";
/** Whether a value is a supported, canonical HTTP(S) proxy origin. */
declare function isValidOpenAICodexProxyUrl(value: unknown): value is string;
/** Search modes accepted by the Codex standalone search endpoint. */
type OpenAICodexSearchMode = 'cached' | 'indexed' | 'live';
/** Search-context sizes accepted by the Codex standalone search endpoint. */
type OpenAICodexSearchContextSize = 'low' | 'medium' | 'high';
/**
 * Whether a value is a bounded per-model context-window override map. Keys
 * are nonempty, unpadded model ids; values are positive safe integers or null
 * to restore that model's catalog default. The Host also checks catalog
 * membership and the model-specific configuration ceiling.
 */
declare function isValidOpenAICodexContextWindowOverrides(value: unknown): value is Readonly<Record<string, number | null>>;
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
  /** Model ids advertised in selectors; undefined advertises the full catalog. */
  models: string[] | undefined;
  /** Route Codex Connect requests through the explicitly configured proxy. */
  enableProxy: boolean;
  /** Credential-free HTTP(S) proxy origin; inactive while enableProxy is false. */
  proxyUrl: string;
  /**
   * Per-model context-window overrides keyed by catalog model id. Each value
   * replaces the advertised `contextWindow` for that model inside the adapter
   * profile for client budgeting. It does not change or verify server capacity,
   * output-token limits, or the deployment's compaction policy.
   */
  contextWindowOverrides: Readonly<Record<string, number>> | undefined;
  enableSearch: boolean;
  enableImageTool: boolean;
  enableImageGeneration: boolean;
  /** Whether this profile accepted the Auto-review data disclosure. */
  autoReviewDisclosureAcknowledged: boolean;
  /** Let the hidden Codex reviewer answer eligible DSH approval requests. */
  enableAutoReview: boolean;
  searchModel: string;
  searchMode: OpenAICodexSearchMode;
  searchContextSize: OpenAICodexSearchContextSize;
  searchMaxOutputTokens: number;
}
declare const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig>;
/** Input settings allow null to disable overrides inherited from a lower settings layer. */
interface OpenAICodexSettingsInput extends Partial<Omit<OpenAICodexSettingsConfig, 'contextWindowOverrides'>> {
  contextWindowOverrides?: Readonly<Record<string, number | null>> | null | undefined;
}
/** Fill the schema defaults even when called without Cordis validation. */
declare function resolveOpenAICodexSettings(value: OpenAICodexSettingsInput): OpenAICodexSettingsConfig;
/** Resolve the active proxy without treating a disabled value as a route. */
declare function resolveOpenAICodexProxyUrl(value: OpenAICodexSettingsInput): string | undefined;
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
  /** Owns the request-scoped dispatcher when a custom proxy is active. */
  readonly proxyManager?: OpenAICodexProxyManager;
  /** Resolve the active proxy for each search request. */
  readonly resolveProxyUrl?: () => string | undefined;
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
  private searchWithoutProxy;
}
//#endregion
//#region src/proxy-paths.d.ts
/** Node-free route constants shared by the Host and browser plugin halves. */
/** Detect bounded local/environment proxy candidates without changing settings. */
declare const OPENAI_CODEX_PROXY_DETECT_PATH = "/plugins/dsh-openai-codex/proxy/detect";
/** Test one manually entered proxy origin without changing settings. */
declare const OPENAI_CODEX_PROXY_TEST_PATH = "/plugins/dsh-openai-codex/proxy/test";
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
//#region src/fast-mode.d.ts
/** Process-local, per-session OpenAI Codex Fast Mode state. */
/** Maximum number of enabled sessions retained by one plugin instance. */
declare const OPENAI_CODEX_FAST_MODE_MAX_SESSIONS = 256;
/** Maximum UTF-16 code units accepted for an opaque DSH session id. */
declare const OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH = 256;
/**
 * Validate the opaque session identity used by the Fast Mode registry.
 *
 * The registry deliberately does not interpret or normalize session ids.  It
 * only rejects values that cannot safely serve as a bounded map key.
 */
declare function isFastModeSessionId(value: unknown): value is string;
/**
 * In-memory Fast Mode registry.  Entries are positive-only: disabling a
 * session removes its key, and an insertion over the bound evicts the least
 * recently touched key.  A new plugin instance starts with an empty map.
 */
declare class FastModeRegistry {
  private readonly maxSessions;
  private readonly enabledSessions;
  constructor(maxSessions?: number);
  /** Number of currently enabled sessions. */
  get size(): number;
  /** Read one session without exposing the map or any credential state. */
  isEnabled(sessionId: unknown): boolean;
  /** Alias useful to callers that model this as a boolean setting. */
  get(sessionId: unknown): boolean;
  /** Enable or disable exactly one opaque session id. */
  set(sessionId: unknown, enabled: boolean): void;
  /** Explicitly named alias for callers that avoid boolean-setting verbs. */
  setEnabled(sessionId: unknown, enabled: boolean): void;
  /** Disable one session and forget its key. */
  delete(sessionId: unknown): void;
  /** Remove all process-local state during an explicit lifecycle teardown. */
  clear(): void;
}
//#endregion
//#region src/fast-mode-paths.d.ts
/** Node-free Fast Mode route constants shared by Host and browser halves. */
/** GET/POST endpoint for one conversation's process-local Fast Mode state. */
declare const OPENAI_CODEX_FAST_MODE_PATH = "/plugins/dsh-openai-codex/fast-mode";
//#endregion
//#region src/update-paths.d.ts
/** Same-origin route used by the browser update reminder. */
declare const OPENAI_CODEX_UPDATE_PATH = "/openai-codex/update";
//#endregion
//#region src/update.d.ts
type OpenAICodexUpdateHighlightKind = 'trusted-origins' | 'runtime-compatibility' | 'quota-fast-mode' | 'dsh-rc7' | 'search-stability' | 'image-generation' | 'oauth-history' | 'model-visibility' | 'proxy-connection' | 'models-account' | 'context-budget' | 'auto-review-probe' | 'auto-review' | 'astra-compatibility' | 'multi-account' | 'search-route';
interface OpenAICodexUpdateHighlight {
  version: string;
  kind: OpenAICodexUpdateHighlightKind;
}
type OpenAICodexDshCompatibilityStatus = 'compatible' | 'plugin-update-required' | 'dsh-update-required' | 'not-yet-compatible' | 'unverified';
interface OpenAICodexDshCompatibilityAdvice {
  status: OpenAICodexDshCompatibilityStatus;
  latestPluginVersion: string;
  latestDshVersion?: string;
  reportCompatibilityGap?: true;
  trackerUrl?: string;
}
type OpenAICodexUpdateResult = {
  status: 'up-to-date';
  currentVersion: string;
  currentDshVersion?: string;
  latestVersion: string;
  compatibility: OpenAICodexDshCompatibilityAdvice;
} | {
  status: 'update-available';
  currentVersion: string;
  currentDshVersion?: string;
  latestVersion: string;
  releaseUrl: string;
  highlights: OpenAICodexUpdateHighlight[];
  versionsBehind?: number;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  compatibility: OpenAICodexDshCompatibilityAdvice;
} | {
  status: 'unavailable';
  currentVersion: string;
  currentDshVersion?: string;
  reason: 'invalid-current-version' | 'registry-unavailable' | 'invalid-registry-response';
};
interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: Array<number | string>;
}
interface UpdateCheckOptions {
  currentVersion: string;
  currentDshVersion?: string;
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}
type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;
/** Parse one exact package version, accepting the conventional leading `v`. */
declare function parseOpenAICodexVersion(raw: string): ParsedVersion | undefined;
/** Compare two package versions using SemVer precedence (build metadata ignored). */
declare function compareOpenAICodexVersions(left: string, right: string): number;
/** Check npm's public dist-tags and enrich an available update with public release notes. */
declare function checkForOpenAICodexUpdate(options: UpdateCheckOptions): Promise<OpenAICodexUpdateResult>;
/** Validate a route response before it is rendered by the browser. */
declare function parseOpenAICodexUpdateResult(value: unknown): OpenAICodexUpdateResult | undefined;
//#endregion
//#region src/history-migration.d.ts
/** Offline compatibility migration for the private Codex search event emitted by Alpha 4.10. */
/** Private event written by Alpha 4.10 before the provider stopped persisting it. */
declare const OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT = "web/openai-codex-search-llm-request";
/** Backup suffix created beside every changed session artifact. */
declare const OPENAI_CODEX_HISTORY_BACKUP_SUFFIX = ".pre-codex-search-history-migration";
interface OpenAICodexHistoryMigrationOptions {
  /** Apply changes; omitted/false performs a read-only dry run. */
  readonly apply?: boolean;
  /** Required acknowledgement that every DSH writer using this root is stopped. */
  readonly confirmStopped?: boolean;
  /** Explicit JSONL persistence root. Defaults to `<DSH_HOME>/sessions`. */
  readonly root?: string;
  /** Optional Harness home override used only when `root` is omitted. */
  readonly dshHome?: string;
}
interface OpenAICodexHistoryMigrationFile {
  readonly path: string;
  readonly changedEvents: number;
  readonly backupPath?: string;
}
interface OpenAICodexHistoryMigrationResult {
  readonly mode: 'apply' | 'dry-run';
  readonly root: string;
  readonly changedFiles: number;
  readonly changedEvents: number;
  readonly files: readonly OpenAICodexHistoryMigrationFile[];
}
/**
 * Mark the retired Alpha 4.10 search event ignorable in compressed JSONL logs.
 * Applying is an offline maintenance operation and fails closed without the
 * caller's explicit acknowledgement that all DSH writers are stopped.
 */
declare function migrateOpenAICodexSearchHistory(options?: OpenAICodexHistoryMigrationOptions): Promise<OpenAICodexHistoryMigrationResult>;
//#endregion
//#region src/index.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-only image transport owned by the Codex Connect core fiber. */
    openaiCodexTransport: OpenAICodexTransportV1;
  }
}
/** Stable Cordis plugin name. */
declare const name = "llm-openai-codex";
/** The model registry required before the provider can register. */
declare const inject: string[];
/** Branded Host settings namespace for Codex Connect capability configuration. */
declare const OPENAI_CODEX_SETTINGS_NS = "llm-openai-codex";
/** Composite model and standalone-search configuration. */
interface Config {
  /** Complete interactive OAuth deadline in milliseconds; applies when the plugin loads. */
  oauthTimeoutMs?: number;
  /** Model ids advertised in selectors; omitted to advertise the full catalog. */
  models?: string[] | undefined;
  /** Route Codex Connect requests through proxyUrl after explicit activation. */
  enableProxy?: boolean;
  /** Credential-free HTTP(S) proxy origin. */
  proxyUrl?: string;
  /**
   * Per-model context-window overrides keyed by catalog model id. Each value
   * replaces the advertised `contextWindow` for that model inside the adapter
   * profile for client budgeting. It does not change or verify server capacity,
   * output-token limits, or the deployment's compaction policy.
   * Whole-map or per-model null disables inherited overrides; omitted keys inherit lower layers.
   */
  contextWindowOverrides?: Record<string, number | null> | null | undefined;
  /** Register the optional standalone Codex search provider. */
  enableSearch?: boolean;
  /** Register the optional image-loading tool. */
  enableImageTool?: boolean;
  /** Register the optional prompt-only image generation tool. */
  enableImageGeneration?: boolean;
  /** Record that this profile accepted the Auto-review data disclosure. */
  autoReviewDisclosureAcknowledged?: boolean;
  /** Let the hidden Codex reviewer answer eligible DSH approval requests. */
  enableAutoReview?: boolean;
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
export { COMPATIBILITY_CONTRACT, COMPATIBILITY_PACKAGES, COMPATIBILITY_SCHEMA_VERSION, type CompatibilityDetectionOptions, type CompatibilityEntry, type CompatibilityEvaluationInput, type CompatibilityPackageName, type CompatibilityReport, type CompatibilityStatus, Config, DEFAULT_OPENAI_CODEX_PROXY_URL, DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE, DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS, DEFAULT_OPENAI_CODEX_SEARCH_MODE, DEFAULT_OPENAI_CODEX_SEARCH_MODEL, DEFAULT_OPENAI_CODEX_SETTINGS, DSH_PLUGIN_API_PACKAGES, FastModeRegistry, FastModeRegistry as OpenAICodexFastModeRegistry, type GeneratedImagePayload, IMAGE_GENERATE_TOOL_NAME, type ImageGenerationRequest, type ImageGenerationResponse, type ImageRequestContext, OPENAI_CODEX_ACCOUNT_LIMIT, OPENAI_CODEX_AUTH_DOCUMENT_LIMIT, OPENAI_CODEX_AUTH_FILENAME, OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX, OPENAI_CODEX_BASE_URL, OPENAI_CODEX_FAST_MODE_MAX_SESSIONS, OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH, OPENAI_CODEX_FAST_MODE_PATH, OPENAI_CODEX_HISTORY_BACKUP_SUFFIX, OPENAI_CODEX_IMAGE_GENERATION_URL, OPENAI_CODEX_IMAGE_MAX_COUNT, OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES, OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES, OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH, OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS, OPENAI_CODEX_LOCAL_PROXY_CANDIDATES, OPENAI_CODEX_PROVIDER, OPENAI_CODEX_PROXY_CANDIDATE_LIMIT, OPENAI_CODEX_PROXY_DETECT_PATH, OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS, OPENAI_CODEX_PROXY_PROBE_URL, OPENAI_CODEX_PROXY_TEST_PATH, OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT, OPENAI_CODEX_SEARCH_PROVIDER, OPENAI_CODEX_SEARCH_URL, OPENAI_CODEX_SETTINGS_NAMESPACE, OPENAI_CODEX_SETTINGS_NS, OPENAI_CODEX_TRANSPORT_API_VERSION, OPENAI_CODEX_TRANSPORT_ERROR_CODES, OPENAI_CODEX_TRANSPORT_SERVICE, OPENAI_CODEX_UPDATE_PATH, OPENAI_CODEX_USAGE_URL, type OpenAICodexAccountSummary, type OpenAICodexAuthStatus, OpenAICodexCredentialStore, type OpenAICodexCredits, type OpenAICodexDiagnosticOptions, type OpenAICodexDiagnosticReport, type OpenAICodexHistoryMigrationFile, type OpenAICodexHistoryMigrationOptions, type OpenAICodexHistoryMigrationResult, type OpenAICodexIndividualLimit, OpenAICodexProxyManager, type OpenAICodexProxyProbeClassification, type OpenAICodexProxyProbeResult, type OpenAICodexRateLimit, type OpenAICodexRateLimitWindow, type OpenAICodexSearchContextSize, type OpenAICodexSearchMode, OpenAICodexSearchProvider, type OpenAICodexSearchProviderOptions, type OpenAICodexSearchRequestRecord, type OpenAICodexSettingsConfig, OpenAICodexTransport, OpenAICodexTransportError, type OpenAICodexTransportErrorCode, type OpenAICodexTransportV1, type OpenAICodexUpdateResult, type OpenAICodexUsage, PI_AI_PACKAGE, SUPPORTED_DSH_PLUGIN_API_VERSION, SUPPORTED_NODE_RANGE, SUPPORTED_PI_AI_RANGE, VIEW_IMAGE_TOOL_NAME, apply, assertNoOpenAICodexProviderConflict, assessCompatibility, checkForOpenAICodexUpdate, compareOpenAICodexVersions, decodeOpenAICodexSettings, detectCompatibility, detectOpenAICodexProxies, diagnoseOpenAICodex, evaluateCompatibility, inject, isFastModeSessionId, isOpenAICodexTransportError, isValidOpenAICodexContextWindowOverrides, isValidOpenAICodexProxyUrl, listOpenAICodexProxyCandidates, loginOpenAICodex, logoutOpenAICodex, mapOpenAICodexSearchResponse, migrateOpenAICodexSearchHistory, name, openAICodexAuthPath, openAICodexAuthStatus, openAICodexConflictMessage, parseOpenAICodexUpdateResult, parseOpenAICodexUsage, parseOpenAICodexVersion, readOpenAICodexRateLimits, resolveOpenAICodexProxyUrl, resolveOpenAICodexSettings };