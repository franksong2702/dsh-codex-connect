/** Verify the local.9 baseline and local.10 overlay in disposable storage. */
import { mkdtemp, mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const candidate = resolve(process.argv[2] ?? '');
if (!process.argv[2]) throw new Error('Usage: node scripts/check-focus-diagnostic.mjs <local9-candidate>');
const base = fileURLToPath(new URL('../',import.meta.url));
const overlay = join(base,'host-patches/codex-cua-focus-diagnostic');
const temporary = await mkdtemp(join(tmpdir(),'focus-diagnostic-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const files = [
 ['NativePlatform.swift','dsh-experimental-cua-macos/native/Sources/CuaNative/NativePlatform.swift','4d819e3a5f356e40fc755daab5e2cf230587352f7ff040f7b0c39ab57ad7d8d0','4bf9a8876e9aa16410f6c933dfbb18842d179f688336d7274a57a8a58991ae7f'],
 ['AXWorker.swift','dsh-experimental-cua-macos/native/Sources/CuaNative/AXWorker.swift','8d7ca01c6646adae9bc8b5f8e3606e5444f8a66c641e22736ccf8d99748c4a55','0f02271fe04533ebea5361313f6c0cc559d8cff48b6a82abb25e59c14629e8e7'],
 ['RequestCoordinator.swift','dsh-experimental-cua-macos/native/Sources/CuaNative/RequestCoordinator.swift','07f6641dca3cf5344e3e603f650b2480300601a9213124764a3cbbefd64e42f8','5cee0c9cd781426af5ce2ddae47161d871570cfca2cd84a775ff435cbdb89b4e'],
 ['host-index.js','dsh-cua/lib/index.js','36c3528326636981c3d640f64f5d4514a332836410efae494d99d4437361592a','9c0b74cabfb2575f278420d37a2c305e7f7d6b4598cee73e3bcca52eb6e623e2'],
 ['diagnostics.mjs',null,'f460d7390cb65d8bc7645d5d028ea2d80c837ccc44162bedccf30c805ef93989','eaf6457292cbf6f1de9ffcd9efbdf0d04572e080b2eb75af9d7474d6eb54edc4'],
];
const run = (cmd,args,options={}) => execFileSync(cmd,args,{stdio:'pipe',encoding:'utf8',...options});
try {
 for (const [name, path, before, after] of files) {
   const input = path ? join(candidate,'packages',path) : join(base,'packages/dsh-codex-computer-use/diagnostics.mjs');
   const contents=await readFile(input); if(![before,after].includes(hash(contents)))throw Error('Unverified focus source: '+name);
   const root=join(temporary,name+'.root'); const target=path ? (name==='host-index.js'?'lib/index.js':'native/Sources/CuaNative/'+name) : 'diagnostics.mjs';
   const targetPath=join(root,target); await mkdir(resolve(targetPath,'..'),{recursive:true}); await writeFile(targetPath,contents);
   if(hash(contents)===after)run('patch',['--batch','--fuzz=0','-R','-p1','-i',join(overlay,name+'.patch')],{cwd:root});
   if(hash(await readFile(targetPath))!==before)throw Error('Baseline digest mismatch: '+name);
   await cp(targetPath,join(temporary,name+'.baseline'));
   if(name==='diagnostics.mjs')await cp(targetPath,join(temporary,'diagnostics-baseline.mjs'));
   run('patch',['--batch','--fuzz=0','-p1','-i',join(overlay,name+'.patch')],{cwd:root});
   if(hash(await readFile(targetPath))!==after)throw Error('Overlay result mismatch: '+name);
 }
 const host=await readFile(join(temporary,'host-index.js.root/lib/index.js'),'utf8');
 const diag=await readFile(join(temporary,'diagnostics.mjs.root/diagnostics.mjs'),'utf8');
 const start=host.indexOf('/** Finite task-failure projection.'),end=host.indexOf('/** Chrome task input policy.',start);
 if(start<0||end<0||host.slice(start,end).trim()!==diag.replace(/^export /gm,'').trim())throw Error('Host/companion diagnostic mismatch');
 process.stdout.write(run(process.execPath,['--test',join(overlay,'projection.test.mjs')],{env:{...process.env,FOCUS_DIAGNOSTIC_MODULE:join(temporary,'diagnostics.mjs.root/diagnostics.mjs'),FOCUS_DIAGNOSTIC_BASELINE:join(temporary,'diagnostics-baseline.mjs')}}));
 const native=join(candidate,'packages/dsh-experimental-cua-macos/native/Sources/CuaNative');
 const sources=[
  ['AXWorker.swift','8d7ca01c6646adae9bc8b5f8e3606e5444f8a66c641e22736ccf8d99748c4a55','Initial Chrome focus did not settle within the bounded preparation window'],
  ['NativeTaskWindow.swift','892c7b8fbaa4005f8279708f2f6e937bb6608a804024eddfdc7b43e7c6804042','Selected Chrome window lost focus or identity'],
  ['ChromeInputPolicy.swift','d999440c65cf344f0e81da764f26f2da3d0e131666c90a451dd2d0acdba856cd','Foreground changed; Chrome input stops'],
 ];
 for(const [name,expected,message] of sources){const bytes=name==='AXWorker.swift'?await readFile(join(temporary,name+'.baseline')):await readFile(join(native,name));if(hash(bytes)!==expected||!bytes.toString().includes(message))throw Error('Native source mismatch: '+name)}
 const client=await readFile(join(candidate,'packages/dsh-cua/lib/native-client.js'));
 if(hash(client)!=='a82b19ef88ab109ad5c8cabccae832b72d288a3e5c611e6216353c7e13e924ae'||!client.toString().includes('new NativeError(reply.error.code, reply.error.message)'))throw Error('Native error transport mismatch');
 const originalPlatform=await readFile(join(temporary,'NativePlatform.swift.baseline'),'utf8'), originalWorker=await readFile(join(temporary,'AXWorker.swift.baseline'),'utf8');
 const candidatePlatform=await readFile(join(temporary,'NativePlatform.swift.root/native/Sources/CuaNative/NativePlatform.swift'),'utf8');
 const candidateWorker=await readFile(join(temporary,'AXWorker.swift.root/native/Sources/CuaNative/AXWorker.swift'),'utf8');
 const before='let top = NativePlatform.windows().first { $0.isOnScreen }', after='let top = NativePlatform.windows(onScreenOrdered: true).first { $0.isOnScreen }';
 if(!originalWorker.includes(before)||!candidateWorker.includes(after)||!candidatePlatform.includes('[.optionOnScreenOnly, .excludeDesktopElements]'))throw Error('Front-window API contract mismatch');
 if(candidateWorker.replace(after,before)!==originalWorker)throw Error('Unexpected window guard or worker change');
 if(process.platform==='darwin' && !process.argv.includes('--js-only')) {
   const patched=join(temporary,'native-candidate'), baseline=join(temporary,'native-baseline');await mkdir(patched);await cp(native,baseline,{recursive:true});
   for(const name of ['NativePlatform.swift','AXWorker.swift','RequestCoordinator.swift']) {await cp(join(temporary,name+'.root/native/Sources/CuaNative',name),join(patched,name));await cp(join(temporary,name+'.baseline'),join(baseline,name));}
   process.stdout.write(run(process.execPath,[join(base,'scripts/check-focus-native-fixtures.mjs'),baseline,patched]));
 }
 process.stdout.write(JSON.stringify({verifiedSource:'local.9',nativeDriverExecuted:false,modelRequests:0,desktopActions:0,macWindowOrderingFixture:process.platform==='darwin' && !process.argv.includes('--js-only')})+'\n');
} finally { await rm(temporary,{recursive:true,force:true}); }
