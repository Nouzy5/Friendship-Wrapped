import Foundation
import Security

/// Holds the session cookie in the Keychain. The web client keeps it in an httpOnly
/// browser cookie; the app reads it from `Set-Cookie` and sends it back itself.
final class SessionTokenStore {
    static let shared = SessionTokenStore()

    /// Development and production cookie names (the `__Host-` prefix needs HTTPS).
    static let cookieNames: Set<String> = ["fw_session", "__Host-fw_session"]

    private let service = "com.friendshipwrapped.session"
    private let account = "session-cookie"
    private let lock = NSLock()
    private var cached: String?
    private var loaded = false

    /// `name=value`, ready to send as a `Cookie` header. Nil when signed out.
    var cookieHeader: String? {
        lock.lock()
        defer { lock.unlock() }
        if !loaded {
            cached = readFromKeychain()
            loaded = true
        }
        return cached
    }

    func save(name: String, value: String) {
        let header = "\(name)=\(value)"
        lock.lock()
        defer { lock.unlock() }
        if loaded && cached == header { return }
        cached = header
        loaded = true
        writeToKeychain(header)
    }

    func clear() {
        lock.lock()
        defer { lock.unlock() }
        cached = nil
        loaded = true
        SecItemDelete(baseQuery as CFDictionary)
    }

    // MARK: - Keychain

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    private func readFromKeychain() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private func writeToKeychain(_ value: String) {
        let attributes: [String: Any] = [
            kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]

        let status = SecItemUpdate(baseQuery as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound {
            let item = baseQuery.merging(attributes) { _, new in new }
            SecItemAdd(item as CFDictionary, nil)
        }
    }
}
