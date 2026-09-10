/** Install only the release reader's existing fetch input while its real constructor is paused. */
import ts from 'typescript'
import { digest, object } from './evidence.ts'
import type { MigrationDebugger } from './migration-debugger.ts'

const endpoint = 'https://api.github.com/repos/mintgao/dsh-desktop/releases?per_page=20'

/** Locate the first constructor statement in the exact bundled release reader.
 * @param source - Source bytes authenticated against the packaged main entrypoint.
 * @returns Zero-based debugger location; ambiguous or absent constructors reject.
 */
export function releaseConstructorLocation(source: string): { lineNumber: number; columnNumber: number } {
  const file = ts.createSourceFile('main.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const locations: number[] = []
  const visit = (node: ts.Node): void => {
    const namedClass = ts.isClassDeclaration(node) && node.name?.text === 'GitHubReleaseDriver' ? node
      : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'GitHubReleaseDriver'
        && node.initializer && ts.isClassExpression(node.initializer) ? node.initializer : undefined
    if (namedClass !== undefined) {
      for (const member of namedClass.members) {
        if (!ts.isConstructorDeclaration(member) || !member.body?.statements[0]) continue
        locations.push(member.body.statements[0].getStart(file))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  const first = locations[0]
  if (locations.length !== 1 || first === undefined) throw new Error('Packaged main must contain one release reader constructor')
  const position = file.getLineAndCharacterOfPosition(first)
  return { lineNumber: position.line, columnNumber: position.character }
}

/** Own the one constructor breakpoint and its deterministic release transport. */
export class NativeReleaseFixture {
  private completion: Promise<Record<string, unknown>> | undefined

  /** Install a breakpoint before the real constructor captures its fetch input.
   * @param connection - Existing main-process inspector paused before entrypoint execution.
   * @param script - Authenticated main script identifier and source.
   * @param architecture - Actual packaged architecture determining the synthetic asset name.
   * @param signal - Fixture-wide cancellation and deadline.
   * @returns Exact synthetic response bytes and breakpoint location for the input manifest.
   */
  async install(connection: MigrationDebugger, script: { scriptId: string; source: string }, architecture: 'arm64' | 'x64', signal: AbortSignal): Promise<Record<string, unknown>> {
    const version = '9.9.9'
    const body = JSON.stringify([{ tag_name: `desktop-v${version}`, name: 'Synthetic migration release', draft: false,
      prerelease: true, published_at: '2026-01-01T00:00:00Z', assets: [{ name: `DSH-Desktop-Mint-${version}-${architecture}.dmg` }] }])
    const location = { scriptId: script.scriptId, ...releaseConstructorLocation(script.source) }
    const breakpoint = await connection.send('Debugger.setBreakpoint', { location }, signal)
    if (typeof breakpoint['breakpointId'] !== 'string') throw new Error('Release constructor breakpoint was not installed')
    const breakpointId = breakpoint['breakpointId']
    this.completion = (async () => {
      const pause = await connection.event('Debugger.paused', signal)
      if (!Array.isArray(pause['hitBreakpoints']) || !pause['hitBreakpoints'].includes(breakpointId)
        || !Array.isArray(pause['callFrames']) || pause['callFrames'].length === 0) {
        throw new Error('Native release fixture paused outside its owned constructor breakpoint')
      }
      const frame = object(pause['callFrames'][0])
      if (typeof frame['callFrameId'] !== 'string') throw new Error('Release constructor has no inspector frame')
      const injected = await connection.send('Debugger.evaluateOnCallFrame', { callFrameId: frame['callFrameId'],
        expression: `(()=>{
          const options=arguments[0];
          if(!options || typeof options.fetch!=='function') throw new Error('Missing release fetch input');
          const receipt={endpoint:${JSON.stringify(endpoint)},body:${JSON.stringify(body)},status:200,etag:'"migration-fixture"',requests:[]};
          globalThis.__dshMigrationReleaseTransport=receipt;
          options.fetch=async(url,init)=>{
            if(url!==receipt.endpoint || init?.method!=='GET') throw new Error('Unexpected release fixture request');
            receipt.requests.push({url,method:init.method,headers:Object.fromEntries(new Headers(init.headers))});
            return new Response(receipt.body,{status:receipt.status,headers:{'content-type':'application/json',etag:receipt.etag}});
          };
          return {installed:true,architecture:options.architecture,currentVersion:options.currentVersion};
        })()`, returnByValue: true }, signal)
      if (injected['exceptionDetails'] !== undefined) throw new Error(JSON.stringify(injected['exceptionDetails']))
      await connection.send('Debugger.removeBreakpoint', { breakpointId }, signal)
      await connection.send('Debugger.resume', {}, signal)
      return object(object(injected['result'])['value'])
    })()
    // The visitor awaits this promise after normal startup; retain early failure without an unhandled rejection.
    void this.completion.catch(() => {})
    return { endpoint, body, bodyDigest: digest(body), status: 200, etag: '"migration-fixture"', location }
  }

  /** Wait until the real constructor resumes with the fixture input installed.
   * @returns Installation observations; fails on missing setup or debugger errors.
   */
  async installed(): Promise<Record<string, unknown>> {
    if (this.completion === undefined) throw new Error('Native release fixture was not installed')
    return await this.completion
  }

  /** Read actual reader requests after native actions; this never changes preferences.
   * @param connection - Existing main-process inspector.
   * @param signal - Fixture deadline.
   * @returns Installed input and exact anonymous release request observations.
   */
  async observe(connection: MigrationDebugger, signal: AbortSignal): Promise<Record<string, unknown>> {
    const installation = await this.installed()
    const response = await connection.send('Runtime.evaluate', {
      expression: 'globalThis.__dshMigrationReleaseTransport', returnByValue: true,
    }, signal)
    if (response['exceptionDetails'] !== undefined) throw new Error(JSON.stringify(response['exceptionDetails']))
    const observed = object(object(response['result'])['value'])
    if (!Array.isArray(observed['requests']) || observed['requests'].length === 0) throw new Error('Real release reader made no observed request')
    return { installation, observed }
  }
}
