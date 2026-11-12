/** Strict report validation for the exact alpha.3 recovery-only Host profile. */
export declare const RECOVERY_HOST: '0.2.2-alpha.3'
export declare const RECOVERY_CASES: readonly string[]
export declare function inspectRecoveryReport(report: unknown, version?: string): {
  cases: string[]
  tests: number
  profile: 'recovery-only'
  automationExercised: false
}
export declare function assertRecoveryCrashes(report: unknown): void

export declare function isRecoveryHost(version: unknown): boolean
export declare function recoveryCordisVersion(version: string): '4.0.6-alpha.2' | '4.1.0'

export declare const RC2_RECOVERY_CASES: readonly string[]
export declare const RECOVERY_RUNTIME_PACKAGES: readonly string[]
export declare const RC2_RECOVERY_RUNTIME_PACKAGES: readonly string[]
export declare function recoveryCases(version: string): string[]
export declare function recoveryRuntimePackages(version: string): string[]
