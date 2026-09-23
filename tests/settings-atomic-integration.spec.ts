import { expect, it } from 'vitest'
import { Config } from '../src/index.ts'

it('keeps profile-editable fields in stable Volatile references with resolved defaults', () => {
  const config = Config({ enableProxy: true, proxyUrl: 'http://127.0.0.1:8899' })

  expect(config.enableProxy.get()).toBe(true)
  expect(config.proxyUrl.get()).toBe('http://127.0.0.1:8899')
  expect(config.searchMode.get()).toBe('cached')
  expect(config.contextWindowOverrides.get()).toBeUndefined()
})
