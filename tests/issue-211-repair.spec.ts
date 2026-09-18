import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error Build-only JavaScript helper is not a shipped TypeScript API.
import { repairOperations, validateRepairCandidate, sha256 } from '../scripts/issue-211-repair.mjs'

const source = 'import {\n  resolveBundleDir, resolveProfileDir, loadOverlayPatches, type ProfileManifest,\n} from "host"\nfunction test() {\n    return runProfilePnpm(context, args, options)\n}\n'
let root: string | undefined
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = undefined })

async function candidate() {
  root = await mkdtemp(join(tmpdir(), 'issue211-descriptor-'))
  const tarballPath = join(root, 'candidate.tgz')
  await writeFile(tarballPath, 'candidate-fixture')
  return { tarballPath, tarballSha256: sha256('candidate-fixture'), moduleSha256: sha256('module-fixture') }
}

describe('explicit upstream repair evidence', () => {
  it('uses the host projection only for explicit CLI exec, with cancellation checks', () => {
    const fixed = repairOperations(source)
    expect(fixed).toContain("options.execution === 'cli' && args[0] === 'exec'")
    expect(fixed).toContain('healIsolatedProfileModuleFallback({ installAnchor: context.installAnchor, profile })')
    expect(fixed.match(/throwIfAborted/g)).toHaveLength(2)
    expect(fixed).toContain('userLayer: false')
  })
  it('refuses stale upstream source, duplicate targets and double application', () => {
    expect(() => repairOperations(source.replace('runProfilePnpm', 'changed'))).toThrow()
    expect(() => repairOperations(`${source}${source}`)).toThrow()
    expect(() => repairOperations(repairOperations(source))).toThrow('already applied')
  })
  it('leaves ordinary stock verification without a candidate', async () => {
    expect(await validateRepairCandidate(undefined, '0.1.5-rc.2', false)).toBeUndefined()
  })
  it('requires exact alpha.2, explicit candidate mode and an exact descriptor', async () => {
    const value = await candidate()
    await expect(validateRepairCandidate(value, '0.1.5-rc.2', true)).rejects.toThrow()
    await expect(validateRepairCandidate(value, '0.1.6-alpha.2', false)).rejects.toThrow()
    await expect(validateRepairCandidate({ ...value, implicit: true }, '0.1.6-alpha.2', true)).rejects.toThrow()
    await expect(validateRepairCandidate(null, '0.1.6-alpha.2', true)).rejects.toThrow()
  })
  it('returns a detached, verified candidate descriptor', async () => {
    const value = await candidate()
    const admitted = await validateRepairCandidate(value, '0.1.6-alpha.2', true)
    expect(admitted).toEqual(value)
    expect(admitted).not.toBe(value)
  })
  it('rejects changed archive bytes', async () => {
    const value = await candidate()
    await writeFile(value.tarballPath, 'changed')
    await expect(validateRepairCandidate(value, '0.1.6-alpha.2', true)).rejects.toThrow('changed')
  })
  it('rejects symlink artifacts', async () => {
    const value = await candidate()
    const link = join(root!, 'link.tgz')
    await symlink(value.tarballPath, link)
    await expect(validateRepairCandidate({ ...value, tarballPath: link }, '0.1.6-alpha.2', true)).rejects.toThrow()
  })
  it('rejects malformed hashes and relative paths', async () => {
    const value = await candidate()
    await expect(validateRepairCandidate({ ...value, moduleSha256: 'invalid' }, '0.1.6-alpha.2', true)).rejects.toThrow()
    await expect(validateRepairCandidate({ ...value, tarballPath: 'relative.tgz' }, '0.1.6-alpha.2', true)).rejects.toThrow()
  })
})
