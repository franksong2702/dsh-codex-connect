/** Compile the exact-source focus candidate in a temporary directory; never execute the helper. */
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('Native build requires macOS arm64');
if(!process.argv[2])throw Error('Usage: node scripts/check-focus-native-build.mjs <local9-candidate> | --package <patched-local9-package>');
const base=fileURLToPath(new URL('../',import.meta.url));
const packageMode=process.argv[2]==='--package';if(packageMode&&!process.argv[3])throw Error('Missing package source');
const candidate=resolve(packageMode?process.argv[3]:process.argv[2]);
const overlay=join(base,'host-patches/codex-cua-focus-diagnostic');
const original=packageMode?join(candidate,'native/Sources/CuaNative'):join(candidate,'packages/dsh-experimental-cua-macos/native/Sources/CuaNative');
const expected=JSON.parse(await readFile(join(overlay,'local9-native-sources.json'),'utf8'));
const names=(await readdir(original)).filter(name=>name.endsWith('.swift')).sort();
if(JSON.stringify(names)!==JSON.stringify(Object.keys(expected).sort()))throw Error('Native source set mismatch');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const temporary=await mkdtemp(join(tmpdir(),'focus-native-build-'));
const root=join(temporary,'package'),source=join(root,'native/Sources/CuaNative');
const run=(cmd,args,options={})=>execFileSync(cmd,args,{stdio:'pipe',encoding:'utf8',...options});
try {
 await mkdir(source,{recursive:true});
 for(const name of names){const bytes=await readFile(join(original,name));if(hash(bytes)!==expected[name])throw Error('Native source digest mismatch: '+name);await writeFile(join(source,name),bytes)}
 for(const [name,after] of [
  ['NativePlatform.swift','4bf9a8876e9aa16410f6c933dfbb18842d179f688336d7274a57a8a58991ae7f'],
  ['AXWorker.swift','0f02271fe04533ebea5361313f6c0cc559d8cff48b6a82abb25e59c14629e8e7'],
  ['RequestCoordinator.swift','5cee0c9cd781426af5ce2ddae47161d871570cfca2cd84a775ff435cbdb89b4e'],
 ]) { run('patch',['--batch','--fuzz=0','-p1','-i',join(overlay,name+'.patch')],{cwd:root});if(hash(await readFile(join(source,name)))!==after)throw Error('Native overlay digest mismatch: '+name); }
 process.stdout.write(run(process.execPath,[join(base,'scripts/check-focus-native-fixtures.mjs'),original,source]));
 const binary=join(temporary,'UNEXECUTED-native');
 run('xcrun',['swiftc','-O','-whole-module-optimization','-swift-version','6','-parse-as-library','-module-name','CuaNative','-target','arm64-apple-macos14.0','-module-cache-path',join(temporary,'cache'),...names.map(name=>join(source,name)),'-o',binary]);
 const binarySha256=hash(await readFile(binary));
 for(const name of names)if(!['NativePlatform.swift','AXWorker.swift','RequestCoordinator.swift'].includes(name)&&hash(await readFile(join(source,name)))!==expected[name])throw Error('Native source changed during build: '+name);
 process.stdout.write(JSON.stringify({source:'local.9 plus proposed focus overlay',sourceFiles:names.length,binarySha256,nativeExecuted:false,desktopActions:0,modelRequests:0})+'\n');
} finally { await rm(temporary,{recursive:true,force:true}); }
