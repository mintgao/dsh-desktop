/** Pure URL policy for the Electron desktop renderer. */

/** Decide whether a renderer navigation stays within the ready dsh Web origin. */
export function isAllowedAppNavigation(candidate: string, applicationUrl: string): boolean {
  try {
    const target = new URL(candidate)
    const application = new URL(applicationUrl)
    return target.protocol === 'http:' && target.origin === application.origin
  } catch {
    return false
  }
}

/** Return an HTTP(S) URL that may be delegated to the system browser. */
export function externalWebUrl(candidate: string): string | undefined {
  try {
    const target = new URL(candidate)
    return target.protocol === 'http:' || target.protocol === 'https:' ? target.href : undefined
  } catch {
    return undefined
  }
}
