// Synthetic regular files only. No native driver, application, AX or permission.
import Foundation
import Darwin

@main struct ExecutableIdentityFixture {
    enum FixtureFailure: Error { case processChanged, pathReadFailed }
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let actual = directory.appendingPathComponent("actual").path
        let alias = directory.appendingPathComponent("alias").path
        let other = directory.appendingPathComponent("other").path
        try Data("same bytes".utf8).write(to: URL(fileURLWithPath: actual))
        try Data("same bytes".utf8).write(to: URL(fileURLWithPath: other))
        guard link(actual, alias) == 0 else { fatalError("synthetic hard link failed") }
        var checks = 0
        func verify(_ expected: String, actualPath: String? = nil,
                    process: () throws -> Void = {}, current: (() throws -> String)? = nil,
                    use: () throws -> Void = {}) throws {
            try ExecutableIdentity.withVerifiedPaths(actualPath: actualPath ?? actual, expectedPath: expected,
                verifyProcess: process, currentActualPath: current ?? { actual }) { _ in try use() }
        }
        func denied(_ run: () throws -> Void) {
            do { try run(); fatalError("invalid identity admitted") } catch { checks += 1 }
        }
        try verify(actual); checks += 1
        try verify(alias); checks += 1 // Different strings, real equal device/inode.
        var aliasPath = actual
        try verify(alias, current: { aliasPath }, use: { aliasPath = alias }); checks += 1
        denied { try verify(other) } // Identical bytes/size still differ in file identity.
        denied { try verify("") }
        denied { try verify(alias, actualPath: "") }
        denied { try verify(directory.appendingPathComponent("missing").path) }
        denied { try verify(directory.path) } // Non-regular objects cannot be executables.
        denied { try verify(alias, process: { throw FixtureFailure.processChanged }) }
        var generation = 1
        denied { try verify(alias, process: { guard generation == 1 else { throw FixtureFailure.processChanged } },
                            use: { generation = 2 }) }
        denied { try verify(alias, current: { throw FixtureFailure.pathReadFailed }) }
        var currentPath = actual
        denied { try verify(alias, current: { currentPath }, use: { currentPath = other }) }
        denied { try verify(alias, use: {
            guard unlink(alias) == 0, link(other, alias) == 0 else { fatalError("replacement fixture failed") }
        }) }
        guard unlink(alias) == 0, link(actual, alias) == 0 else { fatalError("fixture reset failed") }
        denied { try verify(alias, use: {
            try FileManager.default.moveItem(atPath: actual, toPath: actual + ".pinned")
            guard link(other, actual) == 0 else { fatalError("actual replacement failed") }
        }) }
        try FileManager.default.removeItem(atPath: actual)
        try FileManager.default.moveItem(atPath: actual + ".pinned", toPath: actual)
        denied { try verify(alias, use: { guard unlink(alias) == 0 else { fatalError("unlink fixture failed") } }) }
        guard link(actual, alias) == 0 else { fatalError("fixture reset failed") }
        if geteuid() != 0 {
            guard chmod(actual, 0) == 0 else { fatalError("mode fixture failed") }
            denied { try verify(alias) }
            guard chmod(actual, 0o600) == 0 else { fatalError("mode fixture reset failed") }
        }
        try verify(alias); checks += 1
        print("ExecutableIdentityFixture: \(checks) checks passed; real same-file metadata accepted, different files/read errors/restart/path replacement rejected; no application or desktop")
    }
}
