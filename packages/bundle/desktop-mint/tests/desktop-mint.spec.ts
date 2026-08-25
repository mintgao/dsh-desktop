/** The Mint Bundle selects product features without owning their implementation. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'

describe('desktop-mint bundle', () => {
  it('declares the notification plugin and Mint default through its patch manifest', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.dependencies).toHaveProperty(
      '@deepseek-ai/dsh-client-ui-session-notifications',
      'workspace:^',
    )
    const parsed = yaml.load(
      readFileSync(resolve(root, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    )
    expect(parsed).toEqual([{
      insert: [{
        id: 'ui-session-notifications',
        name: '@deepseek-ai/dsh-client-ui-session-notifications',
        config: { defaultMode: 'background' },
      }],
    }])
  })
})
