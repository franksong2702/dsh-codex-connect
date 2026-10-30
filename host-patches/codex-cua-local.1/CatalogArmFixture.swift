// Fake values around exact production coordinator catalog selection and worker arm dispatch.
// The input constructor is a stub: this proves their contract, not AX, HID or OS input.
import Foundation
struct NativeFailure: Error { let code: String; let message: String }
struct ProcessIdentity: Equatable { let pid: Int32 }
struct ApplicationInfo { let pid: Int32 }
struct ApplicationCatalogSnapshot {
 let applications: [ApplicationInfo]; let frontPID: Int32?
 func application(_ pid: Int32) -> ApplicationInfo? { applications.first { $0.pid == pid } }
}
enum ApplicationCatalog { static func snapshot() -> ApplicationCatalogSnapshot { .init(applications: [.init(pid:42)], frontPID:42) } }
struct Request { let method: String }
func catalogFor(_ method: String) -> ApplicationCatalogSnapshot {
 let request=Request(method:method)
 /* PRODUCTION_CATALOG_SELECTION */
 return catalog
}
struct RequestParameters {
 var hasWindow=true; var windowIDValue:UInt32=7;var scope="chrome-instance";var expiry=1100
 func contains(_ key:String)->Bool {key == "windowId" && hasWindow}
 func windowID()throws->UInt32 {windowIDValue}
 func string(_ key:String)throws->String {key == "inputScope" ? scope : "synthetic-task"}
 func integer(_ key:String,in range:ClosedRange<Int>)throws->Int {expiry}
}
struct NativeTaskWindow { let windowID:UInt32=7 }
struct CancellationLatch {}
final class ChromeTaskInput {
 static func now()->Int64 {1000}
 init(owner:ProcessIdentity,window:NativeTaskWindow,taskID:String,expiresAt:Int64,application:ApplicationInfo,cancellation:CancellationLatch,interval:Double){}
}
struct ForegroundPlan {
 let appHandle:String;let identity:ProcessIdentity;let snapshotID:String?;let index:Int?
 let targetWindowID:UInt32?;let role:String;let main:Bool?;let minimized:Bool?
 var taskInputFocus=false
}
enum DriverOutcome {case foreground(ForegroundPlan)}
final class WorkerHarness {
 var chromeInput:ChromeTaskInput?;var taskWindow:NativeTaskWindow?=NativeTaskWindow()
 var keyboard:Int?;var pointer:Int?;let cancellation=CancellationLatch();let textEventInterval=0.0
 func execute(_ method:String,params:RequestParameters,catalog:ApplicationCatalogSnapshot)throws->DriverOutcome {
  let handle="synthetic-retained-handle",identity=ProcessIdentity(pid:42)
  /* PRODUCTION_AUTHORIZE_TASK_INPUT */
  throw NativeFailure(code:"UNSUPPORTED",message:"fixture only drives arm")
 }
}
@main struct CatalogArmFixture {
 static func main() {
  do {
   var checks=0
   func expect(_ value:Bool,_ label:String)throws {if !value{throw NativeFailure(code:"ASSERTION",message:label)};checks+=1}
   let worker=WorkerHarness()
   let result=try worker.execute("authorizeTaskInput",params:RequestParameters(),catalog:catalogFor("authorizeTaskInput"))
   if case .foreground(let plan)=result {try expect(plan.taskInputFocus && plan.targetWindowID == 7 && plan.identity.pid == 42 && worker.chromeInput != nil,"valid retained target reaches foreground plan")}
   for method in ["getApp","listApps","findApps","typeText","pressKey"] {try expect(catalogFor(method).application(42) != nil,"existing catalog route preserved")}
   for method in ["getState","click","scroll","setValue","screenshot","checkTaskInput","taskInput"] {try expect(catalogFor(method).applications.isEmpty,"unrelated routes do not gain catalog")}
   for mode in ["missing-target","missing-window-field","window-mismatch","scope-mismatch","already-armed","missing-application","expired","far-deadline"] {
    let w=WorkerHarness();var p=RequestParameters();var catalog=catalogFor("authorizeTaskInput")
    switch mode {
    case "missing-target":w.taskWindow=nil
    case "missing-window-field":p.hasWindow=false
    case "window-mismatch":p.windowIDValue=8
    case "scope-mismatch":p.scope="other"
    case "already-armed":w.chromeInput=ChromeTaskInput(owner:.init(pid:42),window:.init(),taskID:"old",expiresAt:1100,application:.init(pid:42),cancellation:.init(),interval:0)
    case "missing-application":catalog = .init(applications:[],frontPID:nil)
    case "expired":p.expiry=1000
    default:p.expiry=181001
    }
    do {_=try w.execute("authorizeTaskInput",params:p,catalog:catalog);throw NativeFailure(code:"ASSERTION",message:"invalid binding accepted: \(mode)")}
    catch let error as NativeFailure {try expect(error.code == (["expired","far-deadline"].contains(mode) ? "CUA_INPUT_EXPIRED":"CUA_INPUT_SCOPE_DENIED"),"binding/deadline guard retained: \(mode)")}
   }
   print("CatalogArmFixture: \(checks) production-route/arm contract checks passed; no native driver, OS metadata or desktop input")
  } catch let error as NativeFailure {
   print("CatalogArmFixture: FAIL \(error.code): \(error.message)");exit(1)
  } catch {print("CatalogArmFixture: FAIL synthetic contract");exit(1)}
 }
}
