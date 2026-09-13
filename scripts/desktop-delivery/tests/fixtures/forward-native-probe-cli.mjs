/** Controlled evaluation of the actual probe CLI, with no native launch or staging. */
import * as fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')+'/';
const code=ts.transpileModule(fs.readFileSync(root+'forward-native-probe-cli.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
async function scenario(name, failure, result) {
  let output, disposed=false, applicationRemoved=false;
  const process={arch:'x64',exitCode:0};
  const context=vm.createContext({process,JSON,Error,Buffer});
  const spec={purpose:'desktop-forward-native-capability',candidate:{name:'candidate.json'},native:{name:'native.json'},runtimeDigest:'digest'};
  const modules={
    'node:fs':{readFileSync:()=>Buffer.from('{}'),writeFileSync:(path,bytes,opts)=>{assert.equal(opts.flag,'wx'); output=JSON.parse(bytes)}},
    'node:path':path,
    'node:util':{parseArgs:()=>({values:{spec:'spec',dmg:'/tmp/a.dmg',out:'/tmp/out','timeout-ms':'120000'}})},
    'node:child_process':{execFileSync:()=> 'x86_64'},
    './migration-qualifier.ts':{withCopiedApp:async(dmg,callback)=>{await callback('/private/staged/installation/copied.app'); if(failure==='post-staging')throw Error('immutability'); applicationRemoved=true}},
    './runtime-inventory.ts':{runtimeInventory:()=>({sha256:'digest'})},
    './forward-native-probe.ts':{hostedProbeDriver:()=>({driver:{},roots:{data:'/private/fixture',home:'/private/fixture/home'},dispose:()=>{disposed=true}}),runForwardProbe:async()=>result},
    './forward-native-probe-input.ts':{forwardProbeSpec:()=>spec,verifyProbeInputs:()=>{if(failure==='authentication')throw Error('bad bytes')}}
  };
  const mod=new vm.SourceTextModule(code,{context});
  await mod.link(async name=>{const exports=modules[name]; if(!exports)throw Error(name); const keys=Object.keys(exports);return new vm.SyntheticModule(keys,function(){for(const key of keys)this.setExport(key,exports[key])},{context})});
  await mod.evaluate();
  return {name,output,disposed,applicationRemoved,exitCode:process.exitCode};
}
(async()=>{
 const observed={purpose:'desktop-forward-native-capability',qualificationEligible:false,state:'observed',cycles:[],cleanup:{stopped:true}};
 const passed=await scenario('observed caller',null,observed);assert.equal(passed.output.state,'observed');assert.equal(passed.disposed,true);assert.equal(passed.exitCode,0);assert.equal(passed.applicationRemoved,true);
 const details={operation:'accessibility-rendered',category:'subprocess-error',subprocess:{exitCode:7,timeout:'unknown'},mainPresence:{freshness:'stale',count:1,expectedPid:101,expectedIdentity:'present'}};
 const diagnostic=await scenario('diagnostics exported after disposable cleanup',null,{...observed,state:'blocked',firstFailure:'initial-rendered-window:refused',failureDetails:details});
 assert.deepEqual(diagnostic.output.failureDetails,details);assert.equal(diagnostic.disposed,true);assert.equal(diagnostic.applicationRemoved,true);assert.equal(diagnostic.exitCode,1);
 const denied=await scenario('authentication failure','authentication',observed);assert.equal(denied.output.firstFailure,'input-authentication');assert.equal(denied.exitCode,1);assert.equal(denied.disposed,false);
 const cleanup=await scenario('cleanup failure preserves first error',null,{...observed,state:'blocked',firstFailure:'initial-rendered-window:refused',cleanup:{stopped:false,failure:'deadline'}});assert.equal(cleanup.output.firstFailure,'initial-rendered-window:refused');assert.equal(cleanup.disposed,false);assert.equal(cleanup.exitCode,1);assert.equal(cleanup.applicationRemoved,false);
 const changed=await scenario('post-staging immutability refusal','post-staging',observed);assert.equal(changed.output.state,'blocked');assert.equal(changed.output.firstFailure,'staging-or-runtime-immutability:refused');assert.equal(changed.exitCode,1);
 const pending=await scenario('unresolved launch retains both roots',null,{...observed,state:'blocked',firstFailure:'initial-launch:refused',cleanup:{stopped:false,failure:'launch-completion-unknown',launchCompletionUnknown:true}});
 assert.equal(pending.disposed,false);assert.equal(pending.applicationRemoved,false);assert.equal(pending.output.firstFailure,'initial-launch:refused');assert.equal(pending.exitCode,1);
 assert.equal(pending.output.roots.application,'/private/staged/installation/copied.app');assert.equal(pending.output.roots.staging,'/private/staged');assert.equal(pending.output.roots.data,'/private/fixture');
 console.log(JSON.stringify({scope:'Actual CLI module evaluated with controlled import dependencies; no live staging, native launch, filesystem/process cleanup proof',results:[passed,diagnostic,denied,cleanup,changed,pending]},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
