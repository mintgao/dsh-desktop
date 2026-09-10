import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectConfigCatalog } from './gen-config-catalog.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture(schema: string, declarations = `
/** Caller policy. */
export interface Policy {
  /** Optional policy switch. */
  complete?: boolean
}
/** Caller inputs. */
export interface Input extends Policy {
  /** Authored persona. */
  text: string
}
/** Normalized plugin values. */
export interface Output {
  /** Resolved persona. */
  prefix: string
}
`): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-transform-catalog-'))
  roots.push(root)
  const directory = join(root, 'packages/preset/fixture')
  mkdirSync(join(directory, 'src'), { recursive: true })
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh-fixture' }))
  writeFileSync(join(directory, 'src/index.ts'), `import z from '@deepseek-ai/schemastery'\n${declarations}\n${schema}\nexport function apply(ctx: unknown, config: Output): void {}\n`)
  return root
}

describe('transformed configuration catalog inputs', () => {
  it('publishes caller-only fields and referenced policy types instead of normalized output', () => {
    const [entry] = collectConfigCatalog(fixture(`export const Config: z<Input, Output> = z.transform(z.union([
      z.object({ text: z.string(), complete: z.boolean() }), z.object({ text: z.string() }),
    ]), value => ({ prefix: value.text }), true)`))
    assert.ok(entry)
    expect(entry.configTypeName).toBe('Input')
    expect(entry.schemaKeys).toContain('text')
    expect(entry.pastes?.map(paste => paste.text).join('\n')).toContain('interface Policy')
    expect(entry.pastes?.map(paste => paste.text).join('\n')).not.toContain('interface Output')
  })

  it('rejects schema fields absent from the declared caller input', () => {
    expect(() => collectConfigCatalog(fixture('export const Config: z<Input, Output> = z.transform(z.object({ absent: z.string() }), value => value)')))
      .toThrow(/absent.*declares no such member/)
  })

  it.each([
    'export const Config = z.transform(z.object({ text: z.string() }), value => value)',
    'export let Config: z<Input, Output> = z.transform(z.object({ text: z.string() }), value => value)',
    'export const Config: unrelated<Input, Output> = z.transform(z.object({ text: z.string() }), value => value)',
    'export const Config: z<Input> = z.transform(z.object({ text: z.string() }), value => value)',
    'export const Config: z<{ text: string }, Output> = z.transform(z.object({ text: z.string() }), value => value)',
    'export const Config: z<Missing, Output> = z.transform(z.object({ text: z.string() }), value => value)',
    'export const Config: z<Input, Output> = z.transform(dynamic, value => value)',
  ])('rejects unsupported or unresolved transformed input: %s', (schema) => {
    expect(() => collectConfigCatalog(fixture(schema))).toThrow()
  })

  it.each(['referencedSchema', '...referencedSchemas'])('rejects unsupported transformed union branches: %s', (branch) => {
    expect(() => collectConfigCatalog(fixture(`export const Config: z<Input, Output> = z.transform(z.union([
      ${branch}, z.object({ text: z.string() }),
    ]), value => value)`))).toThrow(/transformed union element.*not an inline schema call/)
  })

  it('rejects an external input declaration', () => {
    expect(() => collectConfigCatalog(fixture(
      'export const Config: z<Input, Output> = z.transform(z.object({ text: z.string() }), value => value)',
      "import type { Input } from 'external-input'\nexport interface Output { /** Resolved value. */ prefix: string }",
    ))).toThrow(/imported from 'external-input'/)
  })

  it.each(['', 'export const Config = z.object({ prefix: z.string() })',
    'export const Config = z.union([z.object({ prefix: z.string() })])'])('retains parameter selection outside transforms: %s', (schema) => {
    const [entry] = collectConfigCatalog(fixture(schema))
    assert.ok(entry)
    expect(entry.configTypeName).toBe('Output')
  })
})
