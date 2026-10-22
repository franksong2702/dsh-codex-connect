import { playwright, type PlaywrightBrowserProvider } from '@vitest/browser-playwright'
import { mergeConfig, defineConfig } from 'vitest/config'
import browserConfig from './vitest.browser.config.ts'

const touchProvider = playwright({ contextOptions: { hasTouch: true, viewport: { width: 390, height: 844 } } })
const config = mergeConfig(browserConfig, defineConfig({
  test: {
    browser: {
      commands: {
        async tapTouch({ provider, sessionId }, selector: string) {
          // Vitest's browser page wrapper has no device touchscreen action; bridge to Playwright's Page.
          const { page, frame } = (provider as PlaywrightBrowserProvider).getCommandsContext(sessionId)
          const box = await (await frame()).locator(selector).boundingBox()
          if (!box) throw new Error(`Touch target is not visible: ${selector}`)
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
        },
      },
    },
  },
}))

// Vite mergeConfig concatenates arrays; keep this derived run touch-only rather
// than adding this include to the base browser suite or running that suite with hasTouch.
config.test!.include = ['tests/browser/speed-mode-touch.client.spec.tsx']
// Set after merging to replace the base provider object, rather than merge its options.
config.test!.browser!.provider = touchProvider

export default config
