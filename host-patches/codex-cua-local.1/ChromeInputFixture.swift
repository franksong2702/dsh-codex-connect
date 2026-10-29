import Foundation
final class FakeInputState {
    var records: [String] = []
    var reject = false
    var releaseIdentity = true
}
@main struct ChromeInputFixture {
    static func require(_ value: @autoclosure () -> Bool, _ message: String) { precondition(value(), message) }
    static func denied(_ operation: () throws -> Void) { do { try operation(); preconditionFailure("expected denial") } catch {} }
    static func main() throws {
        let rows = try JSONDecoder().decode([[String: JSONValue]].self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        for row in rows {
            var params = row["params"]!.object!
            params["appHandle"] = .string("synthetic-app"); params["windowId"] = .number(7); params["taskId"] = .string("synthetic-task")
            let expected = row["allowed"] == .bool(true)
            let accepted: Bool
            do { try ChromeInputRules.validate(params); accepted = true } catch { accepted = false }
            require(accepted == expected, "shared policy case mismatch")
        }
        func armed() throws -> ChromeInputPolicy {
            let value = ChromeInputPolicy(pid: 42, expiresAt: 2000)
            try value.arm(now: 1000, frontPID: 42, hardware: [1,2], identity: {}, window: {})
            return value
        }
        let preparing = ChromeInputPolicy(pid:42, expiresAt:2000, hardware:[1,2])
        denied { try preparing.arm(now:1000, frontPID:42, hardware:[1,3], identity:{}, window:{}) }
        require(preparing.closed, "takeover during initial focus must latch")
        let takeover = try armed()
        denied { try takeover.check(now: 1001, frontPID: 42, hardware: [1,3], identity: {}, window: {}) }
        require(takeover.closed, "takeover must latch")
        denied { try takeover.check(now: 1002, frontPID: 42, hardware: [1,2], identity: {}, window: {}) }
        denied { try takeover.arm(now: 1002, frontPID: 42, hardware: [1,2], identity: {}, window: {}) }
        let focus = try armed()
        denied { try focus.check(now: 1001, frontPID: 99, hardware: [1,2], identity: {}, window: {}) }
        require(focus.closed, "focus loss must latch")
        let window = try armed()
        denied { try window.check(now: 1001, frontPID: 42, hardware: [1,2], identity: {}, window: { throw NativeFailure(code:"STALE",message:"synthetic replacement") }) }
        require(window.closed, "window replacement must latch")
        let process = try armed()
        denied { try process.check(now: 1001, frontPID: 42, hardware: [1,2], identity: { throw ExecutableIdentityFailure.changed }, window: {}) }
        require(process.closed, "process/executable change must latch")
        let expiry = try armed()
        denied { try expiry.check(now: 2000, frontPID: 42, hardware: [1,2], identity: {}, window: {}) }
        require(expiry.closed, "deadline must latch")
        // Exercise the exact pure emitter used by production. No event source,
        // CGEvent construction or OS posting is required for these fault cases.
        let state = FakeInputState()
        denied { try BalancedInputSequence.chord(modifierCount: 1,
            check: { if state.reject { throw NativeFailure(code:"CANCELLED",message:"synthetic stop") } }, canRelease: { state.releaseIdentity },
            modifierDown: { _ in state.records.append("modifier-down") }, modifierUp: { _ in state.records.append("modifier-up") },
            keyDown: { state.records.append("key-down"); state.reject = true }, keyUp: { state.records.append("key-up") }, pause: {}) }
        require(state.records == ["modifier-down","key-down","key-up","modifier-up"], "cancellation must release main key and modifier")
        let gone = FakeInputState()
        denied { try BalancedInputSequence.chord(modifierCount: 1,
            check: { if gone.reject { throw NativeFailure(code:"STALE",message:"synthetic replacement") } }, canRelease: { gone.releaseIdentity },
            modifierDown: { _ in gone.records.append("modifier-down") }, modifierUp: { _ in gone.records.append("modifier-up") },
            keyDown: { gone.records.append("key-down"); gone.reject = true; gone.releaseIdentity = false }, keyUp: { gone.records.append("key-up") }, pause: {}) }
        require(gone.records == ["modifier-down","key-down"], "cleanup must not post into a replacement process")
        // Real synthetic files exercise the same lifetime-pinned executable lease.
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: folder) }
        let selected = folder.appendingPathComponent("selected"), alias = folder.appendingPathComponent("alias")
        try Data("synthetic".utf8).write(to: selected)
        try FileManager.default.linkItem(at: selected, to: alias)
        let lease = try ExecutableIdentity.Lease(actualPath: selected.path, expectedPath: alias.path, verifyProcess: {})
        try lease.require(verifyProcess: {}, currentActualPath: { alias.path })
        try FileManager.default.removeItem(at: alias); try Data("replacement".utf8).write(to: alias)
        denied { try lease.require(verifyProcess: {}, currentActualPath: { selected.path }) }
        print("Chrome policy cases: \(rows.count); lifecycle, cancellation, balanced release and pinned-file negatives passed. Native driver/OS input: not executed.")
    }
}
