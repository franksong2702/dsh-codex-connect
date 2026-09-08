import { describe, expect, it } from 'vitest'
import {
  detectCompatibility,
  evaluateCompatibility,
  SUPPORTED_DSH_PLUGIN_API_VERSION,
  SUPPORTED_NODE_RANGE,
  SUPPORTED_PI_AI_RANGE,
} from '../src/compatibility.ts'

const compatiblePackages = {
  '@deepseek-ai/dsh-llm': SUPPORTED_DSH_PLUGIN_API_VERSION,
  '@deepseek-ai/dsh-llm-pi-ai': SUPPORTED_DSH_PLUGIN_API_VERSION,
  '@earendil-works/pi-ai': '0.84.4',
} as const

describe('compatibility contract', () => {
  it('evaluates the declared Node, DSH API, and pi-ai versions as compatible', () => {
    const report = evaluateCompatibility({ nodeVersion: 'v22.19.0', packageVersions: compatiblePackages })
    expect(report).toEqual({
      schemaVersion: 1,
      status: 'compatible',
      node: { supported: SUPPORTED_NODE_RANGE, installed: 'v22.19.0', status: 'compatible' },
      packages: {
        '@deepseek-ai/dsh-llm': { supported: SUPPORTED_DSH_PLUGIN_API_VERSION, installed: SUPPORTED_DSH_PLUGIN_API_VERSION, status: 'compatible' },
        '@deepseek-ai/dsh-llm-pi-ai': { supported: SUPPORTED_DSH_PLUGIN_API_VERSION, installed: SUPPORTED_DSH_PLUGIN_API_VERSION, status: 'compatible' },
        '@earendil-works/pi-ai': { supported: SUPPORTED_PI_AI_RANGE, installed: '0.84.4', status: 'compatible' },
      },
    })
  })

  it('marks a declared package mismatch unverified rather than incompatible', () => {
    const report = evaluateCompatibility({
      nodeVersion: 'v24.0.0',
      packageVersions: { ...compatiblePackages, '@earendil-works/pi-ai': '0.82.2' },
    })
    expect(report.status).toBe('unverified')
    expect(report.packages['@earendil-works/pi-ai']).toMatchObject({ installed: '0.82.2', status: 'unverified' })
  })

  it('accepts stable pi-ai patch releases in the DSH caret range only', () => {
    expect(evaluateCompatibility({
      nodeVersion: 'v24.0.0',
      packageVersions: { ...compatiblePackages, '@earendil-works/pi-ai': '0.84.2' },
    }).status).toBe('compatible')
    expect(evaluateCompatibility({
      nodeVersion: 'v24.0.0',
      packageVersions: { ...compatiblePackages, '@earendil-works/pi-ai': '0.85.0' },
    }).status).toBe('unverified')
    expect(evaluateCompatibility({
      nodeVersion: 'v24.0.0',
      packageVersions: { ...compatiblePackages, '@earendil-works/pi-ai': '0.84.5-beta.1' },
    }).status).toBe('unverified')
  })

  it('keeps missing metadata unknown rather than claiming compatibility', () => {
    const report = evaluateCompatibility({ nodeVersion: 'not-a-node-version', packageVersions: {} })
    expect(report.status).toBe('unknown')
    expect(report.node.status).toBe('unknown')
    expect(report.packages['@deepseek-ai/dsh-llm'].installed).toBeNull()
  })

  it('keeps a newer DSH unverified and prioritizes missing metadata or a known engine mismatch', () => {
    const packageVersions = { ...compatiblePackages, '@deepseek-ai/dsh-llm': '0.1.3-alpha.1', '@deepseek-ai/dsh-llm-pi-ai': '0.1.3-alpha.1' }
    expect(evaluateCompatibility({ nodeVersion: 'v24.18.0', packageVersions }).status).toBe('unverified')
    expect(evaluateCompatibility({ nodeVersion: 'unknown', packageVersions }).status).toBe('unknown')
    expect(evaluateCompatibility({ nodeVersion: 'v20.0.0', packageVersions }).status).toBe('incompatible')
  })

  it('supports injected package metadata without reading paths or credentials', async () => {
    const report = await detectCompatibility({
      nodeVersion: 'v24.0.1',
      readPackageVersion: async name => compatiblePackages[name],
    })
    expect(report.status).toBe('compatible')
    expect(JSON.stringify(report)).not.toMatch(/node_modules|Users|token|credential/iu)
  })
})
