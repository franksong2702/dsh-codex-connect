/** Strict report validation for the exact alpha.3 recovery-only Host profile. */
export declare const RECOVERY_HOST: '0.2.2-alpha.3'
export declare const RECOVERY_CASES: readonly string[]
export declare function inspectRecoveryReport(report: unknown): {
  cases: string[]
  tests: number
  profile: 'recovery-only'
  automationExercised: false
}
export declare function assertRecoveryCrashes(report: unknown): void
