# @cordisjs/plugin-hmr

Hot module replacement for loader-managed Cordis plugins.

The HMR plugin watches source files, traces Node's module graph, clears affected
module caches, and reloads only the plugin entries that depend on changed
application files. Changes to framework-level dependencies fall back to
`loader.exit()`, letting the host process restart.

Module watches canonicalize their existing base directory before opening
Chokidar. Exact config watches likewise canonicalize the deepest existing
ancestor, then restore any missing suffix. Callbacks and diagnostics retain the
requested absolute filename, while the native backend receives one filesystem
spelling even when Windows supplied an 8.3 alias.

## Requirements

- `@cordisjs/plugin-loader`
- `@cordisjs/plugin-timer`
- A runtime that exposes Node's internal module loader. The package throws if
  the loader service has no internal module loader available.

## Usage

```yaml
- id: timer
  name: '@cordisjs/plugin-timer'
- id: hmr
  name: '@cordisjs/plugin-hmr'
  config:
    root:
      - src
    ignored:
      - '**/node_modules'
      - '**/.*'
    debounce: 100
```

## Config

| Field | Description |
| --- | --- |
| `base` | Optional base directory resolved from `ctx.baseUrl`. |
| `root` | Chokidar roots to watch. Defaults to `['.']`. |
| `ignored` | Picomatch patterns excluded from watch and reload analysis. |
| `debounce` | Milliseconds to wait before processing a burst of changes. |
| `usePolling` | Optional backend selection. Exact config registrations default to an owned target sampler; module watches keep Chokidar's native default. |
| `interval` | Optional positive 32-bit timer interval in milliseconds; exact samplers and Chokidar default to 100. |
| `binaryInterval` | Optional positive integer binary-file interval for Chokidar paths; defaults to 300. Exact samplers use `interval` uniformly. |

Exact config sampling awaits and records one initial target stat before registration returns. It then owns one timer and at most one outstanding stat, comparing bigint file identity, type, size and timestamp fields. Missing targets or components are absence; persistent creation after registration is compared with that recorded state. Recurring sampling performs no directory enumeration or subscriptions, regardless of unrelated siblings. Canonical setup traverses ancestors; the initial existing ancestor must persist with the same identity.

Sampling observes persistent state and can miss transient intermediate edits. Unexpected later I/O errors preserve the last successful observation and report through `hmr/config-update-failed`, deduplicating consecutive equivalent errors while continuing to observe recovery. Callback failures do not automatically retry refreshes. Disposal cancels scheduling, awaits raw I/O and drains admitted callbacks. Error notification listeners may finish after closure, allowing a listener to await disposal without a cleanup cycle.

Explicit `usePolling: false` keeps Chokidar native watching with exact-path filtering and its startup notification limitation. `CHOKIDAR_USEPOLLING` takes precedence (`false`/`0` select native, `true`/`1` select sampling); other values reject exact registration. `CHOKIDAR_INTERVAL` overrides `interval` and must be a positive 32-bit timer integer. Module watching remains unchanged.

## Events

| Event | Description |
| --- | --- |
| `hmr/change` | Emitted for changed files that are not handled by plugin reload or config reload. |
| `hmr/reload` | Emitted after one or more plugin entries are reloaded. |
