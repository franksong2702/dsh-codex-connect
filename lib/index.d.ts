import z from "@deepseek-ai/schemastery";
import { AuthInteraction, Credential, CredentialInfo, CredentialStore, OAuthCredential } from "@earendil-works/pi-ai";
import { Context, Service } from "@deepseek-ai/cordis";
import "@deepseek-ai/dsh-tools";
import { WebSearchProvider, WebSearchRequest, WebSearchResult } from "@deepseek-ai/dsh-web";
//#region src/account-profile.d.ts
type OpenAICodexAccountProfileSource = 'oauth' | 'generated';
//#endregion
//#region src/store.d.ts
/** Provider route and pi-ai provider id owned by this bundle. */
export declare const OPENAI_CODEX_PROVIDER = "openai-codex";
/** Basename of the OAuth document inside the Harness home. */
export declare const OPENAI_CODEX_AUTH_FILENAME = ".openai-codex-auth.json";
/** Maximum number of stored OpenAI Codex accounts. */
export declare const OPENAI_CODEX_ACCOUNT_LIMIT = 16;
/** Maximum serialized credential document size. */
export declare const OPENAI_CODEX_AUTH_DOCUMENT_LIMIT: number;
/** Suffix used for the one-time version-1 rollback copy. */
export declare const OPENAI_CODEX_AUTH_V1_BACKUP_SUFFIX = ".v1-backup";
interface OpenAICodexAccountSummary {
  accountKey: string;
  displayName: string;
  maskedEmail?: string;
  profileSource: OpenAICodexAccountProfileSource;
  active: boolean;
}
/** One request's credentials and browser labels from the same document read. */
interface CapturedOpenAICodexAccount extends CredentialStore {
  accounts(): Promise<readonly OpenAICodexAccountSummary[]>;
  captureActiveAccount(): Promise<CapturedOpenAICodexAccount>;
}
/**
 * Resolve the default OAuth document path.
 * @param dshHome - optional Harness-home override.
 * @returns the absolute owner-only document path.
 */
export declare function openAICodexAuthPath(dshHome?: string): string;
/** File-backed pi-ai store scoped to the single OpenAI Codex provider. */
export declare class OpenAICodexCredentialStore implements CredentialStore {
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
  captureActiveAccount(): Promise<CapturedOpenAICodexAccount>;
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
  modify(providerId: string, fn: (current: Credential | undefined) => Promise<Credential | undefined>, options?: Parameters<CredentialStore['modify']>[2]): Promise<Credential | undefined>;
  /** @inheritdoc */
  delete(providerId: string): Promise<void>;
  /** Allow the provider's 15-second refresh plus bounded filesystem completion. */
  private withWriterLock;
}
//#endregion
//#region src/provider-proxy.d.ts
/** Explicit Codex-only HTTP(S) proxying, probing, and lifecycle ownership. */
/** Canonical first-party endpoint used for a no-auth, no-model reachability probe. */
export declare const OPENAI_CODEX_PROXY_PROBE_URL = "https://chatgpt.com/backend-api/codex";
/** Upper bound for one candidate probe, including CONNECT and response headers. */
export declare const OPENAI_CODEX_PROXY_PROBE_TIMEOUT_MS = 3000;
/** Maximum number of candidates considered by automatic detection. */
export declare const OPENAI_CODEX_PROXY_CANDIDATE_LIMIT = 8;
/** Bounded local candidates documented by the settings UI. */
export declare const OPENAI_CODEX_LOCAL_PROXY_CANDIDATES: readonly ["http://127.0.0.1:7890", "http://127.0.0.1:7897", "http://127.0.0.1:10809"];
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
export declare function listOpenAICodexProxyCandidates(): readonly string[];
/** One plugin instance owns its proxy agents and contributes one global wrapper owner. */
export declare class OpenAICodexProxyManager {
  private readonly agents;
  private readonly connections;
  private activeOperations;
  private idleWaiters;
  private disposed;
  private disposePromise;
  private closing;
  private waitForIdle;
  private closeAgents;
  private shutdown;
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
  /** Allow one second to drain, then destroy owned pools with a one-second completion bound. */
  dispose(): Promise<void>;
  /** Bound shutdown as on disposal; reject new proxy leases until reconfiguration finishes. */
  deactivate(): Promise<void>;
}
/** Probe the bounded automatic candidate set in parallel. */
export declare function detectOpenAICodexProxies(manager: OpenAICodexProxyManager): Promise<readonly OpenAICodexProxyProbeResult[]>;
//#endregion
//#region src/backend-request-policy.d.ts
type OpenAICodexBackendIdentity = 'plugin' | 'preserve' | 'probe';
interface OpenAICodexBackendResponseMeta {
  readonly clientRequestId: string;
  readonly httpStatus: number;
  readonly httpRequestId?: string;
  readonly retryAfterMs?: number;
}
//#endregion
//#region src/backend-request.d.ts
type OpenAICodexBackendLane = 'model' | 'search' | 'quota' | 'image' | 'auto-review';
type BackendFetch = typeof globalThis.fetch;
interface OpenAICodexBackendRunOptions {
  readonly lane: OpenAICodexBackendLane;
  readonly signal?: AbortSignal | undefined;
  readonly timeoutMs?: number | undefined;
}
interface OpenAICodexBackendFetchOptions {
  readonly lane: OpenAICodexBackendLane;
  readonly identity?: OpenAICodexBackendIdentity;
  readonly fetch?: BackendFetch;
  readonly onAttempt?: (meta: Pick<OpenAICodexBackendResponseMeta, 'clientRequestId'>) => void;
  readonly onResponse?: (meta: OpenAICodexBackendResponseMeta) => void | Promise<void>;
}
interface OpenAICodexBackendRunContext {
  readonly signal: AbortSignal;
  fetch(input: string | URL | Request, init?: RequestInit, options?: Omit<OpenAICodexBackendFetchOptions, 'lane'>): Promise<Response>;
}
/** One plugin instance owns one governor; it never guesses account-level service policy. */
declare class OpenAICodexBackendRequests {
  private readonly proxyManager?;
  private readonly resolveProxyUrl;
  private readonly maxConcurrent;
  private active;
  private readonly waiters;
  private readonly cooldowns;
  private readonly lifecycle;
  private disposed;
  constructor(proxyManager?: OpenAICodexProxyManager | undefined, resolveProxyUrl?: () => string | undefined, maxConcurrent?: number);
  private combinedSignal;
  private drain;
  private release;
  private acquire;
  private beforeRequest;
  private admit;
  private recordResponse;
  private fetchAttempt;
  /** Own one logical deadline/proxy scope; each HTTP attempt acquires its own slot. */
  run<T>(options: OpenAICodexBackendRunOptions, operation: (context: OpenAICodexBackendRunContext) => Promise<T>): Promise<T>;
  /** Wrap provider-owned fetch while preserving provider identity and stream proxy lifetime. */
  wrapFetch(options: OpenAICodexBackendFetchOptions): BackendFetch;
  /** Keep the existing proxy lease for the complete provider stream. */
  runStream<T extends {
    result(): Promise<unknown>;
  }>(operation: () => T): T;
  /** Abort queued/in-flight managed requests and prevent new admission. */
  dispose(): void;
}
//#endregion
//#region src/transport.d.ts
/** Cordis service name owned by the core plugin fiber. */
export declare const OPENAI_CODEX_TRANSPORT_SERVICE = "openaiCodexTransport";
/** Structured contract version used across the core and companion packages. */
export declare const OPENAI_CODEX_TRANSPORT_API_VERSION: 1;
/** Stage-zero verified image-generation endpoint. */
export declare const OPENAI_CODEX_IMAGE_GENERATION_URL = "https://chatgpt.com/backend-api/codex/images/generations";
/** Network deadline covering the request and bounded response read. */
export declare const OPENAI_CODEX_IMAGE_REQUEST_TIMEOUT_MS = 120000;
/** Maximum accepted success-body size: 48 MiB. */
export declare const OPENAI_CODEX_IMAGE_MAX_RESPONSE_BYTES: number;
/** Maximum error-body size read and discarded: 64 KiB. */
export declare const OPENAI_CODEX_IMAGE_MAX_ERROR_BYTES: number;
/** Defensive upper bound for unexpected multi-image responses. */
export declare const OPENAI_CODEX_IMAGE_MAX_COUNT = 4;
/** Local prompt limit enforced before any credential or network work. */
export declare const OPENAI_CODEX_IMAGE_PROMPT_MAX_LENGTH = 32000;
/** Stable, secret-free transport errors consumed structurally by companion packages. */
export declare const OPENAI_CODEX_TRANSPORT_ERROR_CODES: {
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
export declare class OpenAICodexTransportError extends Error {
  readonly code: OpenAICodexTransportErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
  constructor(code: OpenAICodexTransportErrorCode, options?: {
    status?: number;
    retryAfterSeconds?: number;
  });
}
/** Identify transport failures structurally without relying on cross-package class identity. */
export declare function isOpenAICodexTransportError(error: unknown): error is OpenAICodexTransportError;
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
export declare class OpenAICodexTransport extends Service implements OpenAICodexTransportV1 {
  private readonly credentials;
  private readonly proxyManager?;
  private readonly resolveProxyUrl;
  private readonly resolveImageModelHint;
  private readonly backendRequests?;
  readonly apiVersion: 1;
  constructor(ctx: Context, credentials: OpenAICodexCredentialStore, proxyManager?: OpenAICodexProxyManager | undefined, resolveProxyUrl?: () => string | undefined, resolveImageModelHint?: () => string, backendRequests?: OpenAICodexBackendRequests | undefined);
  generateImages(input: ImageGenerationRequest, context: ImageRequestContext): Promise<ImageGenerationResponse>;
  private generateImagesWithoutProxy;
}
//#endregion
//#region src/view-image.d.ts
/** Stable Codex tool name. */
export declare const VIEW_IMAGE_TOOL_NAME = "view_image";
//#endregion
//#region src/image-tool.d.ts
/** Stable model-callable tool name. */
export declare const IMAGE_GENERATE_TOOL_NAME = "codex_connect_image_generate";
//#endregion
//#region src/compatibility.d.ts
export declare const COMPATIBILITY_SCHEMA_VERSION: 1;
export declare const SUPPORTED_NODE_RANGE = "^22.19.0 || >=24.0.0";
export declare const SUPPORTED_DSH_PLUGIN_API_VERSION = "0.1.2-rc.1";
export declare const SUPPORTED_DSH_PLUGIN_API_VERSIONS: readonly ["0.1.2-rc.1", "0.1.5-alpha.1", "0.1.5-rc.1", "0.1.5-rc.2"];
export declare const SUPPORTED_DSH_PLUGIN_API_RANGE: string;
export declare const SUPPORTED_PI_AI_RANGE = "^0.84.2 || 0.85.1";
export declare const PI_AI_PACKAGE = "@earendil-works/pi-ai";
export declare const DSH_PLUGIN_API_PACKAGES: readonly ["@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-atomic-write", "@deepseek-ai/dsh-attachment", "@deepseek-ai/dsh-home-paths", "@deepseek-ai/dsh-host-webserver", "@deepseek-ai/dsh-invariants", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@deepseek-ai/dsh-fs", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-settings", "@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-util-values", "@deepseek-ai/dsh-web"];
export declare const COMPATIBILITY_PACKAGES: readonly ["@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@earendil-works/pi-ai"];
type CompatibilityPackageName = (typeof COMPATIBILITY_PACKAGES)[number];
/** Version metadata proves a declared match, not behavioral failure for an untested package. */
type CompatibilityStatus = 'compatible' | 'unverified' | 'incompatible' | 'unknown';
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
export declare const COMPATIBILITY_CONTRACT: {
  readonly schemaVersion: 1;
  readonly engines: {
    readonly node: "^22.19.0 || >=24.0.0";
  };
  readonly dshPluginApi: {
    readonly version: "0.1.2-rc.1";
    readonly versions: readonly ["0.1.2-rc.1", "0.1.5-alpha.1", "0.1.5-rc.1", "0.1.5-rc.2"];
    readonly packages: readonly ["@deepseek-ai/dsh-agent", "@deepseek-ai/dsh-atomic-write", "@deepseek-ai/dsh-attachment", "@deepseek-ai/dsh-home-paths", "@deepseek-ai/dsh-host-webserver", "@deepseek-ai/dsh-invariants", "@deepseek-ai/dsh-llm", "@deepseek-ai/dsh-llm-pi-ai", "@deepseek-ai/dsh-fs", "@deepseek-ai/dsh-session", "@deepseek-ai/dsh-settings", "@deepseek-ai/dsh-tools", "@deepseek-ai/dsh-util-values", "@deepseek-ai/dsh-web"];
  };
  readonly piAi: {
    readonly package: "@earendil-works/pi-ai";
    readonly version: "^0.84.2 || 0.85.1";
  };
};
/** Evaluate a captured set of versions without touching the filesystem. */
export declare function evaluateCompatibility(input?: CompatibilityEvaluationInput): CompatibilityReport;
/** Alias for callers that prefer assessment terminology. */
export declare const assessCompatibility: typeof evaluateCompatibility;
/** Read installed package metadata and return only versions and statuses. */
export declare function detectCompatibility(options?: CompatibilityDetectionOptions): Promise<CompatibilityReport>;
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
export declare function openAICodexConflictMessage(): string;
/** Fail before the generic registry error so the collision has a migration hint. */
export declare function assertNoOpenAICodexProviderConflict(providerIds: readonly string[]): void;
/**
 * Inspect only process and filesystem metadata. This function never opens the
 * OAuth document, refreshes a token, or starts an authorization flow.
 */
export declare function diagnoseOpenAICodex(options?: OpenAICodexDiagnosticOptions): Promise<OpenAICodexDiagnosticReport>;
//#endregion
//#region src/usage.d.ts
/** Fixed endpoint used by the official Codex client for ChatGPT rate limits. */
export declare const OPENAI_CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
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
export declare function parseOpenAICodexUsage(value: unknown): OpenAICodexUsage;
/**
 * Read current quota without issuing a model request. OAuth is refreshed through
 * the same provider-native credential lifecycle used by normal Codex turns.
 * @param store - plugin-owned OAuth credential store.
 * @returns current rate-limit buckets safe to expose to the local browser page.
 */
export declare function readOpenAICodexRateLimits(store: Pick<OpenAICodexCredentialStore, 'captureActiveAccount'>): Promise<OpenAICodexUsage>;
//#endregion
//#region src/settings-contract.d.ts
/** Node-free settings contract shared by the Host plugin and browser card. */
/** Stable Harness settings namespace owned by this plugin. */
export declare const OPENAI_CODEX_SETTINGS_NAMESPACE = "llm-openai-codex";
/** Suggested local HTTP proxy shown by the settings UI; it is never enabled by default. */
export declare const DEFAULT_OPENAI_CODEX_PROXY_URL = "http://127.0.0.1:7890";
/** Empty profile setting, which makes image requests use the default route hint. */
export declare const DEFAULT_OPENAI_CODEX_IMAGE_MODEL_HINT = "";
/** Validate an optional bounded ASCII image route model hint. */
export declare function isValidOpenAICodexImageModelHint(value: unknown): value is string;
/** Whether a value is a supported, canonical HTTP(S) proxy origin. */
export declare function isValidOpenAICodexProxyUrl(value: unknown): value is string;
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
export declare function isValidOpenAICodexContextWindowOverrides(value: unknown): value is Readonly<Record<string, number | null>>;
/** Default model used by the standalone search endpoint. */
export declare const DEFAULT_OPENAI_CODEX_SEARCH_MODEL = "gpt-5.6-sol";
/** Default search mode, matching the official local Codex client. */
export declare const DEFAULT_OPENAI_CODEX_SEARCH_MODE: OpenAICodexSearchMode;
/** Default provider search-context size. */
export declare const DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE: OpenAICodexSearchContextSize;
/** Default output budget for the standalone search response. */
export declare const DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS = 10000;
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
  /** Follow explicit server-authorized Luna Reserve transitions for agent requests. */
  enableReserveFallback: boolean;
  /** Use provider-native Responses V2 compaction when DSH requests compaction. */
  enableNativeCompaction: boolean;
  /** Allow Astra to propose a native effort change; each change still requires a human answer. */
  enableReasoningUpdates: boolean;
  enableImageTool: boolean;
  enableImageGeneration: boolean;
  /** Optional profile-scoped model hint for image generation; empty uses the route default. */
  imageModelHint: string;
  /** Whether this profile accepted the Auto-review data disclosure. */
  autoReviewDisclosureAcknowledged: boolean;
  /** Let the hidden Codex reviewer answer eligible DSH approval requests. */
  enableAutoReview: boolean;
  searchModel: string;
  searchMode: OpenAICodexSearchMode;
  searchContextSize: OpenAICodexSearchContextSize;
  searchMaxOutputTokens: number;
}
export declare const DEFAULT_OPENAI_CODEX_SETTINGS: Readonly<OpenAICodexSettingsConfig>;
/** Input settings allow null to disable overrides inherited from a lower settings layer. */
interface OpenAICodexSettingsInput extends Partial<Omit<OpenAICodexSettingsConfig, 'contextWindowOverrides'>> {
  contextWindowOverrides?: Readonly<Record<string, number | null>> | null | undefined;
}
/** Fill the schema defaults even when called without Cordis validation. */
export declare function resolveOpenAICodexSettings(value: OpenAICodexSettingsInput): OpenAICodexSettingsConfig;
/** Resolve the active proxy without treating a disabled value as a route. */
export declare function resolveOpenAICodexProxyUrl(value: OpenAICodexSettingsInput): string | undefined;
/** Narrow the redacted settings wire payload before it enters React state. */
export declare function decodeOpenAICodexSettings(value: unknown): OpenAICodexSettingsConfig | undefined;
//#endregion
//#region src/search.d.ts
/** Stable dsh web-provider id selected by the bundle patch. */
export declare const OPENAI_CODEX_SEARCH_PROVIDER = "openai-codex";
/** Trusted first-party Codex base; OAuth credentials never cross to a configured origin. */
export declare const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
/** Standalone search endpoint used by the official Codex client. */
export declare const OPENAI_CODEX_SEARCH_URL = "https://chatgpt.com/backend-api/codex/alpha/search";
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
  /** Shared runtime request governor; preferred over the legacy proxy-only path. */
  readonly backendRequests?: OpenAICodexBackendRequests;
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
export declare function mapOpenAICodexSearchResponse(value: unknown): WebSearchResult;
/** OpenAI Codex standalone-search provider using the same refreshable OAuth store as the LLM route. */
export declare class OpenAICodexSearchProvider implements WebSearchProvider {
  private readonly options;
  readonly id = "openai-codex";
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
export declare const OPENAI_CODEX_PROXY_DETECT_PATH = "/plugins/dsh-openai-codex/proxy/detect";
/** Test one manually entered proxy origin without changing settings. */
export declare const OPENAI_CODEX_PROXY_TEST_PATH = "/plugins/dsh-openai-codex/proxy/test";
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
export declare function loginOpenAICodex(interaction: AuthInteraction, store?: OpenAICodexCredentialStore): Promise<void>;
/**
 * Remove the stored OpenAI Codex credential.
 * @param store - credential store, defaulting under `$DSH_HOME`.
 */
export declare function logoutOpenAICodex(store?: OpenAICodexCredentialStore): Promise<void>;
/**
 * Read non-secret OpenAI Codex login state without refreshing the token.
 * @param store - credential store, defaulting under `$DSH_HOME`.
 * @returns stored login state and expiry.
 */
export declare function openAICodexAuthStatus(store?: CredentialStore): Promise<OpenAICodexAuthStatus>;
//#endregion
//#region src/fast-mode.d.ts
/** Process-local, per-session OpenAI Codex Fast Mode state. */
/** Maximum number of enabled sessions retained by one plugin instance. */
export declare const OPENAI_CODEX_FAST_MODE_MAX_SESSIONS = 256;
/** Maximum UTF-16 code units accepted for an opaque DSH session id. */
export declare const OPENAI_CODEX_FAST_MODE_MAX_SESSION_ID_LENGTH = 256;
/**
 * Validate the opaque session identity used by the Fast Mode registry.
 *
 * The registry deliberately does not interpret or normalize session ids.  It
 * only rejects values that cannot safely serve as a bounded map key.
 */
export declare function isFastModeSessionId(value: unknown): value is string;
/**
 * In-memory Fast Mode registry.  Entries are positive-only: disabling a
 * session removes its key, and an insertion over the bound evicts the least
 * recently touched key.  A new plugin instance starts with an empty map.
 */
export declare class FastModeRegistry {
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
export declare const OPENAI_CODEX_FAST_MODE_PATH = "/plugins/dsh-openai-codex/fast-mode";
//#endregion
//#region src/update-paths.d.ts
/** Same-origin route used by the browser update reminder. */
export declare const OPENAI_CODEX_UPDATE_PATH = "/openai-codex/update";
//#endregion
//#region src/update.d.ts
type OpenAICodexUpdateHighlightKind = 'trusted-origins' | 'runtime-compatibility' | 'quota-fast-mode' | 'dsh-rc7' | 'search-stability' | 'image-generation' | 'oauth-history' | 'model-visibility' | 'proxy-connection' | 'models-account' | 'context-budget' | 'auto-review-probe' | 'auto-review' | 'astra-compatibility' | 'multi-account' | 'search-route' | 'image-model-hint' | 'luna-reserve';
interface OpenAICodexUpdateHighlight {
  version: string;
  kind: OpenAICodexUpdateHighlightKind;
}
type OpenAICodexUpdateResult = {
  status: 'up-to-date';
  currentVersion: string;
  latestVersion: string;
} | {
  status: 'update-available';
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  highlights: OpenAICodexUpdateHighlight[];
  versionsBehind?: number;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
} | {
  status: 'unavailable';
  currentVersion: string;
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
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}
type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;
/** Parse one exact package version, accepting the conventional leading `v`. */
export declare function parseOpenAICodexVersion(raw: string): ParsedVersion | undefined;
/** Compare two package versions using SemVer precedence (build metadata ignored). */
export declare function compareOpenAICodexVersions(left: string, right: string): number;
/** Check npm's public dist-tags and enrich an available update with public release notes. */
export declare function checkForOpenAICodexUpdate(options: UpdateCheckOptions): Promise<OpenAICodexUpdateResult>;
/** Validate a route response before it is rendered by the browser. */
export declare function parseOpenAICodexUpdateResult(value: unknown): OpenAICodexUpdateResult | undefined;
//#endregion
//#region src/history-migration.d.ts
/** Offline compatibility migration for the private Codex search event emitted by Alpha 4.10. */
/** Private event written by Alpha 4.10 before the provider stopped persisting it. */
export declare const OPENAI_CODEX_SEARCH_MODEL_REQUEST_EVENT = "web/openai-codex-search-llm-request";
/** Backup suffix created beside every changed session artifact. */
export declare const OPENAI_CODEX_HISTORY_BACKUP_SUFFIX = ".pre-codex-search-history-migration";
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
export declare function migrateOpenAICodexSearchHistory(options?: OpenAICodexHistoryMigrationOptions): Promise<OpenAICodexHistoryMigrationResult>;
//#endregion
//#region src/index.d.ts
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-only image transport owned by the Codex Connect core fiber. */
    openaiCodexTransport: OpenAICodexTransportV1;
  }
}
/** Stable Cordis plugin name. */
export declare const name = "llm-openai-codex";
/** The model registry required before the provider can register. */
export declare const inject: string[];
/** Branded Host settings namespace for Codex Connect capability configuration. */
export declare const OPENAI_CODEX_SETTINGS_NS = "llm-openai-codex";
/** Composite model and standalone-search configuration. */
export interface Config {
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
  /** Automatically follow server-authorized Luna Reserve transitions, never generic rate limits. */
  enableReserveFallback?: boolean;
  /** Explicit profile opt-in to Codex native context management; DSH owns automatic triggers. Disabling stops new native compactions, not replay of existing checkpoints. */
  enableNativeCompaction?: boolean;
  /** Opt in to Astra proposals; each native effort change needs an exact human decision. */
  enableReasoningUpdates?: boolean;
  /** Register the optional image-loading tool. */
  enableImageTool?: boolean;
  /** Register the optional prompt-only image generation tool. */
  enableImageGeneration?: boolean;
  /** Optional profile-scoped image route model hint; empty uses the default route hint. */
  imageModelHint?: string;
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
export declare const Config: z<Config>;
/**
 * Register the `openai-codex` LLM route with one provider-native OAuth store.
 * Search and image tooling are added only when their config flags are true.
 * Selecting this route as the Harness default remains a separate profile choice.
 * @param ctx - plugin context carrying the LLM registry plus optional services.
 * @param config - capability gates and standalone-search tuning.
 */
export declare function apply(ctx: Context, config: Config): void;
//#endregion
export { type CompatibilityDetectionOptions, type CompatibilityEntry, type CompatibilityEvaluationInput, type CompatibilityPackageName, type CompatibilityReport, type CompatibilityStatus, FastModeRegistry as OpenAICodexFastModeRegistry, type GeneratedImagePayload, type ImageGenerationRequest, type ImageGenerationResponse, type ImageRequestContext, type OpenAICodexAccountSummary, type OpenAICodexAuthStatus, type OpenAICodexCredits, type OpenAICodexDiagnosticOptions, type OpenAICodexDiagnosticReport, type OpenAICodexHistoryMigrationFile, type OpenAICodexHistoryMigrationOptions, type OpenAICodexHistoryMigrationResult, type OpenAICodexIndividualLimit, type OpenAICodexProxyProbeClassification, type OpenAICodexProxyProbeResult, type OpenAICodexRateLimit, type OpenAICodexRateLimitWindow, type OpenAICodexSearchContextSize, type OpenAICodexSearchMode, type OpenAICodexSearchProviderOptions, type OpenAICodexSearchRequestRecord, type OpenAICodexSettingsConfig, type OpenAICodexTransportErrorCode, type OpenAICodexTransportV1, type OpenAICodexUpdateResult, type OpenAICodexUsage };