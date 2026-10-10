import Foundation
import Security

/// A random id this phone keeps in the Keychain and sends with every request as `X-Device-Id`, so the
/// server can tell a phone you've signed in on before from a new one (it emails you about new ones).
/// The web app does the same with a cookie; this app keeps cookies by hand, so it can't.
enum DeviceIdentity {
    private static let service = "com.friendshipwrapped.device"
    private static let account = "device-id"

    /// Made the first time it's needed, then the same for as long as the Keychain keeps it.
    static let current: String = {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]

        var read = base
        read[kSecReturnData as String] = true
        read[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        if SecItemCopyMatching(read as CFDictionary, &item) == errSecSuccess,
           let data = item as? Data,
           let id = String(data: data, encoding: .utf8),
           !id.isEmpty {
            return id
        }

        let id = UUID().uuidString
        var add = base
        add[kSecValueData as String] = Data(id.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
        return id
    }()
}
