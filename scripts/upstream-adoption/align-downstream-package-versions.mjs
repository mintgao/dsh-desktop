#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

// Mirrors the authoritative state grammar without loading candidate modules.
const UPSTREAM_TAG_PATTERN = /^dsh-v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u

const [queueTag, currentMain, pinnedUpstream] = process.argv.slice(2)

try {
  const targetVersion = targetVersionFromTag(queueTag)
  const repositoryRoot = git(['rev-parse', '--show-toplevel']).trim()
  const currentMainCommit = exactCommit(currentMain, 'current main')
  const pinnedUpstreamCommit = exactCommit(pinnedUpstream, 'pinned upstream')
  const candidatePaths = manifestPaths(repositoryRoot)
  const changes = []

  for (const path of candidatePaths) {
    const candidate = readManifestFile(repositoryRoot, path)
    if (path === 'package.json' && candidate.value.name !== '@deepseek-ai/dsh-root') {
      throw new Error(`root manifest has unexpected package name ${JSON.stringify(candidate.value.name)}`)
    }
    if (path === 'apps/cli/package.json' && candidate.value.name !== '@deepseek-ai/dsh') {
      throw new Error(`CLI manifest has unexpected package name ${JSON.stringify(candidate.value.name)}`)
    }

    const upstream = readManifestAtRef(pinnedUpstreamCommit, path)
    if ((path === 'package.json' || path === 'apps/cli/package.json') && upstream === undefined) {
      throw new Error(`pinned upstream is missing required ${path}`)
    }
    if (upstream !== undefined) {
      if (!isDshManifest(candidate.value) && !isDshManifest(upstream)) continue
      assertSameDshPackage(candidate.value, upstream, path, 'pinned upstream')
      assertTargetVersion(upstream, targetVersion, path, 'pinned upstream')
      assertTargetVersion(candidate.value, targetVersion, path, 'candidate')
      continue
    }

    if (!isDshManifest(candidate.value)) continue

    const main = readManifestAtRef(currentMainCommit, path)
    if (main === undefined) {
      throw new Error(`${path} has no known owner in pinned upstream or current main`)
    }
    assertSameDshPackage(candidate.value, main, path, 'current main')
    if (candidate.value.version === targetVersion) continue

    changes.push({
      path,
      contents: `${JSON.stringify({ ...candidate.value, version: targetVersion }, null, 2)}\n`,
    })
  }

  for (const change of changes) {
    writeFileSync(resolve(repositoryRoot, change.path), change.contents)
    process.stdout.write(`${change.path}\n`)
  }
} catch (error) {
  console.error(`align-downstream-package-versions: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}

function targetVersionFromTag(tag) {
  if (typeof tag !== 'string' || !UPSTREAM_TAG_PATTERN.test(tag)) {
    throw new Error(`invalid DSH release tag ${JSON.stringify(tag)}`)
  }
  return tag.slice('dsh-v'.length)
}

function exactCommit(value, label) {
  if (typeof value !== 'string' || !/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} must be an exact lowercase commit id`)
  }
  return git(['rev-parse', '--verify', `${value}^{commit}`]).trim()
}

function manifestPaths(repositoryRoot) {
  const paths = ['package.json']
  for (const parent of ['apps', 'packages']) {
    const parentPath = resolve(repositoryRoot, parent)
    if (!existsSync(parentPath)) continue
    for (const first of directories(parentPath)) {
      if (parent === 'apps') {
        const path = `${parent}/${first}/package.json`
        if (existsSync(resolve(repositoryRoot, path))) paths.push(path)
        continue
      }
      const groupPath = resolve(parentPath, first)
      for (const second of directories(groupPath)) {
        const path = `${parent}/${first}/${second}/package.json`
        if (existsSync(resolve(repositoryRoot, path))) paths.push(path)
      }
    }
  }
  const cliIndex = paths.indexOf('apps/cli/package.json')
  if (cliIndex === -1) throw new Error('candidate is missing apps/cli/package.json')
  return paths.sort()
}

function directories(path) {
  return readdirSync(path, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

function readManifestFile(repositoryRoot, path) {
  const absolutePath = resolve(repositoryRoot, path)
  if (relative(repositoryRoot, absolutePath).startsWith('..')) throw new Error(`manifest escapes repository: ${path}`)
  const contents = readFileSync(absolutePath, 'utf8')
  return { value: parseManifest(contents, path) }
}

function readManifestAtRef(ref, path) {
  const matchingPaths = git(['ls-tree', '--name-only', ref, '--', path]).trim()
  if (matchingPaths === '') return undefined
  if (matchingPaths !== path) throw new Error(`${ref}:${path} did not resolve to the exact manifest path`)
  return parseManifest(git(['show', `${ref}:${path}`]), `${ref}:${path}`)
}

function parseManifest(contents, source) {
  let value
  try {
    value = JSON.parse(contents)
  } catch {
    throw new Error(`${source} is not valid JSON`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${source} is not a JSON object`)
  }
  if (typeof value.name !== 'string' || typeof value.version !== 'string') {
    throw new Error(`${source} must contain string name and version fields`)
  }
  return value
}

function isDshManifest(manifest) {
  return manifest.name === '@deepseek-ai/dsh' || manifest.name.startsWith('@deepseek-ai/dsh-')
}

function assertSameDshPackage(candidate, owner, path, ownerLabel) {
  if (!isDshManifest(owner) || owner.name !== candidate.name) {
    throw new Error(`${path} does not match its ${ownerLabel} package ownership`)
  }
}

function assertTargetVersion(manifest, targetVersion, path, source) {
  if (manifest.version !== targetVersion) {
    throw new Error(`${source} ${path} has version ${manifest.version}; expected ${targetVersion}`)
  }
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr).trim() : ''
    throw new Error(`git ${args[0]} failed${stderr ? `: ${stderr}` : ''}`)
  }
}
