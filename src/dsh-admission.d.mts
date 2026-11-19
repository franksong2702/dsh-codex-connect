export type DshAdmissionStatus = 'verified' | 'unverified-in-range' | 'known-bad' | 'outside-range'

export interface DshAdmissionConfig {
  readonly minimum: string
  readonly before: string
  readonly denied: readonly string[]
}

export interface DshAdmission {
  readonly range: string
  readonly verifiedVersions: readonly string[]
  classify(version: unknown): DshAdmissionStatus
}

export function createDshAdmission(verified: readonly string[], config: DshAdmissionConfig): DshAdmission

export const dshPluginApi: {
  readonly version: string
  readonly versions: readonly string[]
  readonly node: { readonly range: string; readonly dshVersions: readonly string[] }
  readonly cordis: { readonly range: string; readonly dshVersions: readonly string[] }
  readonly admission: DshAdmissionConfig
  readonly packages: readonly string[]
}
export const dshAdmission: DshAdmission
export function dshHostNodeRange(version: string | null | undefined): string | undefined
export function dshHostSupportsNode(version: string | null | undefined, nodeVersion: string): boolean
