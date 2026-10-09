import Foundation

/// Which of Apple's push servers a build's tokens belong to. Xcode and debug builds use the
/// sandbox; TestFlight and App Store builds use production. A token only works on its own.
enum PushEnvironment: String {
    case sandbox
    case production

    static var current: PushEnvironment {
        #if DEBUG
        return .sandbox
        #else
        return .production
        #endif
    }
}

private struct PushStatusResponse: Decodable {
    /// Whether the server has an Apple push key and can notify iPhones.
    let apns: Bool?
}

private struct DeviceInput: Encodable {
    let token: String
    let environment: String
}

private struct DeviceTokenInput: Encodable {
    let token: String
}

extension APIClient {
    /// Whether this server can send notifications to iPhones at all. Public, like the web push key.
    func fetchPushSupport() async throws -> Bool {
        let status: PushStatusResponse = try await send(.get, "/notifications/push-key")
        return status.apns ?? false
    }

    /// Gives the server this phone's Apple push token for the signed-in session. Doing it again
    /// is harmless, and it moves the phone to whoever is signed in on it now.
    func registerPushDevice(token: String, environment: PushEnvironment) async throws {
        try await perform(.post, "/notifications/devices", body: DeviceInput(token: token, environment: environment.rawValue))
    }

    /// Stops the server sending to this phone. Signing out does that by itself.
    func removePushDevice(token: String) async throws {
        try await perform(.delete, "/notifications/devices", body: DeviceTokenInput(token: token))
    }
}
