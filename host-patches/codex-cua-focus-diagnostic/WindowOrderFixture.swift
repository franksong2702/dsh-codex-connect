// Synthetic WindowServer contract: the all-window directory may have a different
// order from the explicitly on-screen, front-to-back list. No OS call is made.
import Foundation
struct CGWindowListOption: OptionSet {
    let rawValue: Int
    static let optionOnScreenOnly = Self(rawValue: 1)
    static let excludeDesktopElements = Self(rawValue: 2)
}
let kCGNullWindowID: UInt32 = 0
let kCGWindowLayer = "layer", kCGWindowNumber = "number", kCGWindowOwnerPID = "pid"
let kCGWindowBounds = "bounds", kCGWindowOwnerName = "owner", kCGWindowName = "title", kCGWindowIsOnscreen = "onscreen"
struct WindowBounds { let x: Double, y: Double, width: Double, height: Double }
struct WindowInfo { let windowID: UInt32, pid: Int32, appName: String, title: String, bounds: WindowBounds, isOnScreen: Bool, onCurrentSpace: Bool? }
struct Membership { let onCurrentSpace: Bool? }
struct WindowSpaces { func memberships(windowIDs: [UInt32]) -> [UInt32: Membership] { [:] } }
@MainActor enum FixtureServer {
    static var directory: [[String: Any]] = []
    static var ordered: [[String: Any]] = []
    static var options: CGWindowListOption = []
}
@MainActor func CGWindowListCopyWindowInfo(_ options: CGWindowListOption, _ relative: UInt32) -> Any? {
    precondition(relative == 0); FixtureServer.options = options
    return options.contains(.optionOnScreenOnly) ? FixtureServer.ordered : FixtureServer.directory
}
@MainActor enum NativePlatform {
    /* PRODUCTION_WINDOWS */
}
@MainActor func observedTop() -> (UInt32?, Int32?) {
    /* PRODUCTION_TOP */
    return (top?.windowID, top?.pid)
}
@main struct WindowOrderFixture {
    @MainActor static func main() {
        func row(_ id: Int, _ pid: Int, _ layer: Int = 0, _ onscreen: Bool = true) -> [String: Any] {
            [kCGWindowNumber: NSNumber(value:id), kCGWindowOwnerPID: NSNumber(value:pid), kCGWindowLayer: NSNumber(value:layer), kCGWindowIsOnscreen: NSNumber(value:onscreen)]
        }
        // Both inputs contain the same on-screen windows; their directory order differs.
        FixtureServer.directory = [row(99,99),row(7,42)]
        FixtureServer.ordered = [row(100,100,1),row(7,42),row(99,99)]
        let first = observedTop()
        if CommandLine.arguments.contains("baseline") {
            precondition(first.0 == 99 && first.1 == 99 && !FixtureServer.options.contains(.optionOnScreenOnly))
        } else {
            precondition(first.0 == 7 && first.1 == 42 && FixtureServer.options.contains(.optionOnScreenOnly))
            // Default listing remains the complete directory, preserving other callers.
            precondition(NativePlatform.windows().map(\.windowID) == [99,7] && !FixtureServer.options.contains(.optionOnScreenOnly))
            FixtureServer.ordered = [row(99,99),row(7,42)]
            let foreign = observedTop(); precondition(foreign.0 == 99 && foreign.1 == 99)
            FixtureServer.ordered = []; let absent = observedTop(); precondition(absent.0 == nil && absent.1 == nil)
        }
        print("WindowOrderFixture: \(CommandLine.arguments.contains("baseline") ? "baseline directory misidentifies top" : "ordered option and unchanged directory passed"); synthetic only")
    }
}
