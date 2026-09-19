/** Exact direct dependency versions accepted by the bounded durable probe. */
export declare const DURABLE_RUNTIME_VERSIONS: Readonly<Record<string, string>>
export declare function assertDurableRuntimeVersions(versions: unknown): asserts versions is Record<string, string>
export declare function readVerifiedDurableRuntime(): Promise<Record<string, string>>
