import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

const resource = (name: string): string => fileURLToPath(new URL(`../resources/${name}`, import.meta.url))

describe('desktop startup page', () => {
  it('presents the Mint ocean scene while the backend starts', async () => {
    const html = await readFile(resource('startup.html'), 'utf8')
    const document = new JSDOM(html).window.document
    const main = document.querySelector('main')

    expect({
      label: main?.getAttribute('aria-labelledby'),
      title: document.querySelector('h1')?.textContent,
      subtitle: document.querySelector('p')?.textContent,
      images: [...document.querySelectorAll('img')].map(image => image.getAttribute('src')),
    }).toMatchInlineSnapshot(`
      {
        "images": [
          "startup-ocean.png",
          "startup-whale.svg",
          "startup-bubbles.png",
          "startup-icon.svg",
        ],
        "label": "startup-title",
        "subtitle": "Preparing your local agent workspace…",
        "title": "Starting DSH Desktop",
      }
    `)

    const assets = await Promise.all([
      stat(resource('startup-ocean.png')),
      stat(resource('startup-whale.svg')),
      stat(resource('startup-bubbles.png')),
      stat(resource('startup-icon.svg')),
    ])
    expect(assets.every(asset => asset.size > 0)).toBe(true)
  })

  it('animates the scene unless the user reduces motion', async () => {
    const css = await readFile(resource('startup.css'), 'utf8')

    expect(css).toContain('animation: whale-crossing 6.8s linear infinite')
    expect(css).toContain('animation: whale-bob 1.8s ease-in-out infinite')
    expect(css).toContain('animation: bubbles-rise 2.5s ease-out infinite')
    expect(css).toContain('animation: ocean-drift 7s ease-in-out infinite alternate')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.bubbles { display: none; }')
    expect(css).toContain('.whale-route { left: 38%; opacity: 1; transform: none; }')
  })
})
