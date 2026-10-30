// Pure fixture: no AX objects, native helper, application or system permission.
@main struct WindowScopeFixture {
    static func main() throws {
        var dispatches = 0
        var ownershipReads = 0
        func perform(role: String, expected: UInt32, owner: UInt32?) throws {
            try WindowScopePolicy.require(role: role, expected: expected) { ownershipReads += 1; return owner }
            dispatches += 1
        }
        for role in ["AXMenu", "AXMenuBar", "AXMenuBarItem", "AXMenuItem"] {
            do { try perform(role: role, expected: 7, owner: 7); fatalError("menu admitted") }
            catch WindowScopeViolation.menu { }
        }
        precondition(ownershipReads == 0 && dispatches == 0)
        do { try perform(role: "AXButton", expected: 7, owner: 9); fatalError("foreign window admitted") }
        catch WindowScopeViolation.mismatch { }
        do { try perform(role: "AXTextField", expected: 7, owner: nil); fatalError("unknown owner admitted") }
        catch WindowScopeViolation.unknown { }
        var liveOwner: UInt32? = 7
        try WindowScopePolicy.require(role: "AXTextField", expected: 7) { liveOwner }
        liveOwner = 9
        do { try perform(role: "AXTextField", expected: 7, owner: liveOwner); fatalError("reparented element admitted") }
        catch WindowScopeViolation.mismatch { }
        precondition(dispatches == 0)
        try perform(role: "AXTextField", expected: 7, owner: 7)
        try perform(role: "AXButton", expected: 7, owner: 7)
        precondition(dispatches == 2)
        try WindowScopePolicy.requireRoute(expected: 7, actual: 7)
        try WindowScopePolicy.requireRoute(expected: nil, actual: 9)
        do { try WindowScopePolicy.requireRoute(expected: 7, actual: 9); fatalError("pointer fallback changed window") }
        catch WindowScopeViolation.mismatch { }
        precondition(dispatches == 2)
        var changesDuringAnchor: UInt32? = 7
        do {
            try WindowScopePolicy.checkMutation(anchor: { changesDuringAnchor = 9 }, membership: {
                try WindowScopePolicy.require(role: "AXTextField", expected: 7) { changesDuringAnchor }
            })
            dispatches += 1
            fatalError("element reparented during anchor reads was admitted")
        } catch WindowScopeViolation.mismatch { }
        precondition(dispatches == 2)
        print("WindowScopeFixture: menu/foreign/unknown/reparent rejected; target form/button controls admitted")
    }
}
