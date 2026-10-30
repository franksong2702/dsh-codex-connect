// Pure fake foreground environment around the exact production coordination methods.
// No AppKit, window server, event source or OS input is used.
import Foundation
import Dispatch
struct ProcessIdentity: Equatable, Sendable { let pid: Int32 }
struct ForegroundPlan: Sendable {
 let identity=ProcessIdentity(pid:42); let targetWindowID:UInt32?=7
 let role="AXWindow"; let main:Bool?=nil; let minimized:Bool?=nil; let taskInputFocus=true
 var isRaise:Bool { taskInputFocus }
}
struct ForegroundObservation: Sendable {
 let frontPID:Int32?;let focusedWindowID:UInt32?;let frontWindowID:UInt32?;let frontWindowPID:Int32?
 var json:JSONValue { .null }
}
final class CancellationLatch { var cancelled=false;func check()throws {if cancelled{throw NativeFailure(code:"ABORTED",message:"synthetic cancel")}} }
@MainActor enum ApplicationCatalog {static var worker:AXWorker!;static func activate(_ identity:ProcessIdentity)throws{worker.activations+=1;worker.pendingActivation=true;if worker.takeoverOnActivate{worker.hardware=[1]};if worker.cancelOnActivate{worker.cancellation.cancelled=true}}}
@MainActor final class AXWorker {
 let cancellation:CancellationLatch;let policy=ChromeInputPolicy(pid:42,expiresAt:2000,hardware:[0])
 var observations=0,activations=0,raises=0,arms=0
 var pendingActivation=false,appActive=false,selectedWindow=false,lateActivation=false,takeoverOnActivate=false,cancelOnActivate=false
 var focusedAt=3;var hardware:[UInt32]=[0];var takeoverOnRaise=false;var cancelOnRaise=false;var identityChanged=false;var raceAtArm=false
 init(_ cancellation:CancellationLatch){self.cancellation=cancellation}
 func foregroundObservation(_ plan:ForegroundPlan)throws->ForegroundObservation{
  try cancellation.check();try policy.checkPreparing(now:1000,hardware:hardware,identity:{if self.identityChanged{throw NativeFailure(code:"STALE_APP",message:"synthetic replacement")}},window:{})
  observations+=1
  if lateActivation {
   if pendingActivation && observations>=3 { pendingActivation=false;appActive=true;selectedWindow=false }
   return ForegroundObservation(frontPID:appActive ? 42:99,focusedWindowID:selectedWindow ? 7:8,frontWindowID:selectedWindow ? 7:8,frontWindowPID:appActive ? 42:99)
  }
  let ready=observations>=focusedAt
  return ForegroundObservation(frontPID:ready ? 42:99,focusedWindowID:ready ? 7:8,frontWindowID:ready ? 7:8,frontWindowPID:ready ? 42:99)
 }
 func raise(_ plan:ForegroundPlan)throws{raises+=1;if lateActivation{selectedWindow=true};if takeoverOnRaise{hardware=[1]};if cancelOnRaise{cancellation.cancelled=true}}
 func finishTaskInputFocus(_ plan:ForegroundPlan)throws->JSONValue{
  arms+=1;try policy.arm(now:1000,frontPID:lateActivation ? (appActive ? 42:99) : (observations>=focusedAt ? 42:99),hardware:hardware,identity:{},window:{if self.raceAtArm{throw NativeFailure(code:"CUA_TARGET_STALE",message:"synthetic last moment focus change")}});return .null
 }
 func rejectTaskInputFocus(_ plan:ForegroundPlan)throws->JSONValue{policy.close();throw NativeFailure(code:"CUA_INPUT_FOCUS_LOST",message:"synthetic settle timeout")}
 /* PRODUCTION_SHOULD_RAISE */
}
@MainActor struct CoordinatorHarness {
 let worker:AXWorker;let cancellation:CancellationLatch
 /* PRODUCTION_FOREGROUND */
}
@main struct InitialFocusFixture {
 @MainActor static func scenario(_ setup:(AXWorker)->Void)async throws->AXWorker{
  let latch=CancellationLatch(),worker=AXWorker(latch);ApplicationCatalog.worker=worker;setup(worker)
  _=try await CoordinatorHarness(worker:worker,cancellation:latch).performForeground(ForegroundPlan(),requestID:"synthetic")
  return worker
 }
 @MainActor static func main()async throws{
  let latch=CancellationLatch(),worker=AXWorker(latch);ApplicationCatalog.worker=worker;worker.lateActivation=true
  if CommandLine.arguments.contains("baseline") {
   do { _=try await CoordinatorHarness(worker:worker,cancellation:latch).performForeground(ForegroundPlan(),requestID:"synthetic");preconditionFailure("old ordering unexpectedly succeeded") }
   catch let error as NativeFailure { precondition(error.code=="CUA_INPUT_FOCUS_LOST") }
   precondition(worker.activations==1 && worker.raises==1 && worker.arms==0)
   print("LateActivationFixture: baseline single early raise is undone by delayed activation; synthetic only")
  } else {
   _=try await CoordinatorHarness(worker:worker,cancellation:latch).performForeground(ForegroundPlan(),requestID:"synthetic")
   precondition(worker.activations==1 && worker.raises==1 && worker.arms==1 && worker.policy.active)
   for mode in ["takeover", "cancel"] {
    let l=CancellationLatch(),w=AXWorker(l);ApplicationCatalog.worker=w;w.lateActivation=true
    w.takeoverOnActivate = mode == "takeover"; w.cancelOnActivate = mode == "cancel"
    do { _=try await CoordinatorHarness(worker:w,cancellation:l).performForeground(ForegroundPlan(),requestID:"synthetic");preconditionFailure("guard failed") }
    catch let error as NativeFailure { precondition(error.code == (mode == "takeover" ? "CUA_INPUT_USER_TAKEOVER" : "ABORTED")) }
    precondition(w.activations==1 && w.raises==0 && w.arms==0)
   }
   print("LateActivationFixture: single activation/raise succeeds; takeover and cancellation close before raise; synthetic only")
  }
 }
}
