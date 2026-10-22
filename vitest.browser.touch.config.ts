import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import { playwright, type PlaywrightBrowserProvider } from '@vitest/browser-playwright'

const packageVersion = (JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string }).version

export default defineConfig({
  define: {
    __CODEX_CONNECT_VERSION__: JSON.stringify(packageVersion),
  },
  test: {
    include: ['tests/browser/speed-mode-touch.browser.client.spec.tsx'],
    testTimeout: 30_000,
    browser: {
      enabled: true,
      headless: true,
      instances: [{
        browser: 'chromium',
        provider: playwright({ contextOptions: { hasTouch: true, viewport: { width: 390, height: 844 } } }),
      }],
      commands: {
        async tapTouch({ provider, sessionId }, selector: string) {
          const { page, frame } = (provider as PlaywrightBrowserProvider).getCommandsContext(sessionId)
          const box = await (await frame()).locator(selector).boundingBox()
          if (!box) throw new Error(`Touch target is not visible: ${selector}`)
          await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
        },
        async touchPointCount({ provider, sessionId }) {
          const { frame } = (provider as PlaywrightBrowserProvider).getCommandsContext(sessionId)
          return (await frame()).evaluate(() => navigator.maxTouchPoints)
        },
      },
    },
  },
})
