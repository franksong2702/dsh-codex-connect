// Pure, task-bounded Chrome input policy. No OS input or application access.
import Foundation

enum ChromeInputRules {
    static func navigation(_ value: String) throws -> String {
        guard value.count <= 2048, !value.unicodeScalars.contains(where: { $0.value <= 32 || $0.value == 127 || $0 == "\\" }),
              let parts = URLComponents(string: value), let scheme = parts.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
              let url = parts.url?.absoluteString, url.count <= 512 else {
            throw NativeFailure(code: "CUA_CHROME_NAVIGATION_DENIED", message: "Navigation accepts bounded HTTP/HTTPS addresses only")
        }
        return url
    }
    static func key(_ value: String, modifiers: [String]) throws {
        let key = value.lowercased(), selected = Set(modifiers), sorted = modifiers.sorted().joined(separator: ",")
        let plain: Set<String> = ["enter","return","tab","escape","space","backspace","delete","left","right","up","down","home","end","pageup","pagedown"]
        let movement: Set<String> = ["left","right","up","down","home","end","pageup","pagedown","backspace","delete"]
        let letter = key.utf8.count == 1 && key.utf8.allSatisfy { (97...122).contains($0) }
        guard modifiers.count <= 2, selected.count == modifiers.count, selected.isSubset(of: ["command","control","option","shift"]),
              (sorted.isEmpty && plain.contains(key)) || (sorted == "shift" && (plain.contains(key) || letter))
                || (["option", "option,shift"].contains(sorted) && movement.contains(key))
                || (sorted == "command" && ["a","f","r","z"].contains(key))
                || (sorted == "command,shift" && key == "z")
                || (sorted == "control" && ["a","b","d","e","f","h","k"].contains(key)) else {
            throw NativeFailure(code: "CUA_CHROME_KEY_DENIED", message: "Key chord is outside bounded Chrome editing/navigation input")
        }
    }
    static func validate(_ values: [String: JSONValue]) throws {
        let kind = values["kind"]?.string
        let expected: Set<String>
        switch kind {
        case "text": expected = ["appHandle","windowId","taskId","kind","text"]
        case "key": expected = ["appHandle","windowId","taskId","kind","key","modifiers"]
        case "navigate": expected = ["appHandle","windowId","taskId","kind","url"]
        default: throw NativeFailure(code: "CUA_CHROME_INPUT_INVALID", message: "Unknown Chrome task input kind")
        }
        guard Set(values.keys).isSubset(of: expected) else { throw NativeFailure(code: "CUA_CHROME_INPUT_INVALID", message: "Unexpected Chrome task input field") }
        if kind == "text" {
            guard let text = values["text"]?.string, !text.isEmpty, text.unicodeScalars.count <= 256,
                  !text.unicodeScalars.contains(where: { (0...8).contains($0.value) || [11,12,127].contains($0.value) || (14...31).contains($0.value) }) else {
                throw NativeFailure(code: "CUA_CHROME_TEXT_DENIED", message: "Text must contain 1...256 Unicode scalars without unsupported controls")
            }
        } else if kind == "navigate" {
            guard let text = values["url"]?.string else { throw NativeFailure(code: "CUA_CHROME_NAVIGATION_DENIED", message: "Address is missing") }
            _ = try navigation(text)
        } else {
            guard let key = values["key"]?.string else { throw NativeFailure(code: "CUA_CHROME_KEY_DENIED", message: "Key is missing") }
            let modifiers: [String]
            if let raw = values["modifiers"] {
                guard case .array(let items) = raw, items.allSatisfy({ $0.string != nil }) else { throw NativeFailure(code: "CUA_CHROME_KEY_DENIED", message: "Invalid modifiers") }
                modifiers = items.compactMap(\.string)
            } else { modifiers = [] }
            try self.key(key, modifiers: modifiers)
        }
    }
}

// A serial-worker latch: a detected takeover/identity loss can never be re-armed.
final class ChromeInputPolicy {
    private(set) var active = false
    private(set) var closed = false
    let pid: Int32
    let expiresAt: Int64
    private var hardware: [UInt32] = []
    private let preparingHardware: [UInt32]?
    init(pid: Int32, expiresAt: Int64, hardware: [UInt32]? = nil) { self.pid = pid; self.expiresAt = expiresAt; self.preparingHardware = hardware }
    func close() { active = false; closed = true }
    func checkPreparing(now: Int64, hardware: [UInt32], identity: () throws -> Void, window: () throws -> Void) throws {
        guard !active && !closed else { throw NativeFailure(code: "CUA_INPUT_CLOSED", message: "Chrome input preparation is closed") }
        do {
            guard now < expiresAt else { throw NativeFailure(code: "CUA_INPUT_EXPIRED", message: "Chrome input expired during focus preparation") }
            try identity(); try window()
            if let expected = preparingHardware, hardware != expected { throw NativeFailure(code: "CUA_INPUT_USER_TAKEOVER", message: "Hardware input changed during task focus preparation") }
        } catch { close(); throw error }
    }
    func arm(now: Int64, frontPID: Int32?, hardware: [UInt32], identity: () throws -> Void, window: () throws -> Void) throws {
        guard !active && !closed else { throw NativeFailure(code: "CUA_INPUT_CLOSED", message: "Chrome input cannot be re-armed") }
        do {
            try checkPreparing(now: now, hardware: hardware, identity: identity, window: window)
            try requireCommon(now: now, frontPID: frontPID, identity: identity, window: window)
            self.hardware = hardware; active = true
        } catch { close(); throw error }
    }
    func check(now: Int64, frontPID: Int32?, hardware: [UInt32], identity: () throws -> Void, window: () throws -> Void) throws {
        guard active && !closed else { throw NativeFailure(code: "CUA_INPUT_CLOSED", message: "Chrome input is not active") }
        do {
            try requireCommon(now: now, frontPID: frontPID, identity: identity, window: window)
            guard hardware == self.hardware else { throw NativeFailure(code: "CUA_INPUT_USER_TAKEOVER", message: "Hardware input changed; user takeover stops this task") }
        } catch { close(); throw error }
    }
    private func requireCommon(now: Int64, frontPID: Int32?, identity: () throws -> Void, window: () throws -> Void) throws {
        guard now < expiresAt else { throw NativeFailure(code: "CUA_INPUT_EXPIRED", message: "Chrome input task expired") }
        try identity(); try window()
        guard frontPID == pid else { throw NativeFailure(code: "CUA_INPUT_FOCUS_LOST", message: "Foreground changed; Chrome input stops") }
    }
}
