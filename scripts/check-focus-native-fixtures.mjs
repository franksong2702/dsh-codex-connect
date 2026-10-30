/** Exact old/new focus methods with synthetic WindowServer and activation values. */
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
if(process.platform!=='darwin'||!process.argv[2]||!process.argv[3])throw Error('Usage on macOS: node check-focus-native-fixtures.mjs <baseline-source> <candidate-source>');
const original=resolve(process.argv[2]), candidate=resolve(process.argv[3]);
const overlay=fileURLToPath(new URL('../host-patches/codex-cua-focus-diagnostic/',import.meta.url));
const temporary=await mkdtemp(join(tmpdir(),'focus-native-fixtures-'));
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:'pipe',encoding:'utf8'});
const extract=(source,start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);if(a<0||b<0)throw Error('Native fixture boundary missing');return source.slice(a,b)};
try {
 const [oldPlatform,newPlatform,oldWorker,newWorker,oldCoordinator,newCoordinator,protocol]=await Promise.all([
  readFile(join(original,'NativePlatform.swift'),'utf8'),readFile(join(candidate,'NativePlatform.swift'),'utf8'),
  readFile(join(original,'AXWorker.swift'),'utf8'),readFile(join(candidate,'AXWorker.swift'),'utf8'),
  readFile(join(original,'RequestCoordinator.swift'),'utf8'),readFile(join(candidate,'RequestCoordinator.swift'),'utf8'),readFile(join(original,'Protocol.swift'),'utf8'),
 ]);
 const before='let top = NativePlatform.windows().first { $0.isOnScreen }',after='let top = NativePlatform.windows(onScreenOrdered: true).first { $0.isOnScreen }';
 if(!oldWorker.includes(before)||newWorker.replace(after,before)!==oldWorker)throw Error('Unexpected focus guard change');
 const template=await readFile(join(overlay,'WindowOrderFixture.swift'),'utf8');
 for(const [label,platform,top] of [['baseline',oldPlatform,before],['candidate',newPlatform,after]]) {
  const swift=template.replace('/* PRODUCTION_WINDOWS */',extract(platform,'    static func windows(', '    static func frontPID()')).replace('/* PRODUCTION_TOP */',top);
  const source=join(temporary,label+'.swift'),binary=join(temporary,label);await writeFile(source,swift);
  run('xcrun',['swiftc','-swift-version','6','-parse-as-library','-module-cache-path',join(temporary,'cache'),source,'-o',binary]);
  process.stdout.write(run(binary,label==='baseline'?['baseline']:[]));
 }
 const types=join(temporary,'types.swift'),policy=join(original,'ChromeInputPolicy.swift');await writeFile(types,extract(protocol,'import Foundation','struct NativeRequest:'));
 const lateTemplate=await readFile(join(overlay,'LateActivationFixture.swift'),'utf8');
 const shouldRaise=extract(oldWorker,'    static func shouldRaise(','    func raise(');
 for(const [label,coordinator] of [['late-baseline',oldCoordinator],['late-candidate',newCoordinator]]) {
  const body=extract(coordinator,'    private func performForeground(','    private func transportFailed(').replace('private func','func');
  const source=join(temporary,label+'.swift'),binary=join(temporary,label);
  await writeFile(source,lateTemplate.replace('/* PRODUCTION_SHOULD_RAISE */',shouldRaise).replace('/* PRODUCTION_FOREGROUND */',body));
  run('xcrun',['swiftc','-swift-version','6','-parse-as-library','-module-cache-path',join(temporary,'cache'),types,policy,source,'-o',binary]);
  process.stdout.write(run(binary,label==='late-baseline'?['baseline']:[]));
 }
 const guards=await readFile(join(overlay,'GuardContinuityFixture.swift'),'utf8');
 const guardSource=join(temporary,'guard-continuity.swift'),guardBinary=join(temporary,'guard-continuity');
 const candidateBody=extract(newCoordinator,'    private func performForeground(','    private func transportFailed(').replace('private func','func');
 await writeFile(guardSource,guards.replace('/* PRODUCTION_SHOULD_RAISE */',shouldRaise).replace('/* PRODUCTION_FOREGROUND */',candidateBody));
 run('xcrun',['swiftc','-swift-version','6','-parse-as-library','-module-cache-path',join(temporary,'cache'),types,policy,guardSource,'-o',guardBinary]);
 process.stdout.write(run(guardBinary,[]));
} finally { await rm(temporary,{recursive:true,force:true}) }
