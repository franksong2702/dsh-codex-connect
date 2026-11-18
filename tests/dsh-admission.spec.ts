import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { createDshAdmission, dshAdmission } from '../src/dsh-admission.mjs'

const semver = createRequire(import.meta.url)('semver') as {
  satisfies(version: string, range: string, options?: { includePrerelease: boolean }): boolean
}

it.each(['0.1.7-rc.1', '0.1.7-rc.2', '0.2.0-rc.1', '0.2.0-rc.2'])('excludes retired DSH %s from admission and npm peers', version => {
  expect(dshAdmission.classify(version)).toBe('outside-range')
  expect(dshAdmission.verifiedVersions).not.toContain(version)
  expect(semver.satisfies(version, dshAdmission.range, { includePrerelease: true })).toBe(false)
})

it('admits the range while retaining supported exact versions and excluding the next minor', () => {
  expect(dshAdmission.classify('0.2.1-alpha.1')).toBe('verified')
  expect(dshAdmission.classify('0.2.2-alpha.3')).toBe('verified')
  expect(dshAdmission.classify('0.2.2-alpha.2')).toBe('outside-range')
  expect(dshAdmission.classify('0.2.2-rc.4')).toBe('unverified-in-range')
  expect(dshAdmission.classify('0.2.3')).toBe('unverified-in-range')
  expect(dshAdmission.classify('0.3.0-rc.1')).toBe('outside-range')
})

it('excludes denylisted versions from both native and regular peer checks', () => {
  const fixture = createDshAdmission(['0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.3'], {
    minimum: '0.2.2-rc.1',
    before: '0.3.0-0',
    denied: ['0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.3', '0.2.4'],
  })
  expect(fixture.verifiedVersions).toEqual([])
  for (const version of ['0.2.1-rc.5', '0.2.2-rc.1', '0.2.2-rc.3', '0.2.4', '0.2.4+local']) {
    expect(fixture.classify(version)).toBe('known-bad')
    expect(semver.satisfies(version, fixture.range)).toBe(false)
    expect(semver.satisfies(version, fixture.range, { includePrerelease: true })).toBe(false)
  }
  for (const version of ['0.2.2-rc.2', '0.2.2-rc.4', '0.2.3', '0.2.5']) {
    expect(fixture.classify(version)).toBe('unverified-in-range')
    expect(semver.satisfies(version, fixture.range)).toBe(true)
    expect(semver.satisfies(version, fixture.range, { includePrerelease: true })).toBe(true)
  }
})
