import Foundation

/// Build-time settings. The server addresses come from FW_API_BASE_URL and
/// FW_WEB_BASE_URL in project.yml (one value per build configuration).
enum AppConfig {
    /// The Express API, e.g. `http://localhost:4000/api`. Nil when this build wasn't given one.
    static let apiBaseURL: URL? = url(forInfoKey: "FWAPIBaseURL")

    /// The web client. Invite links point here so anyone can open them, with or without the app.
    static let webBaseURL: URL? = url(forInfoKey: "FWWebBaseURL")

    /// Opens invite links in the app: `friendshipwrapped://invite/<token>`.
    static let urlScheme = "friendshipwrapped"

    /// e.g. "0.1.0 (12)".
    static var version: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "?"
        let build = info?["CFBundleVersion"] as? String ?? "?"
        return "\(version) (\(build))"
    }

    private static func url(forInfoKey key: String) -> URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: key) as? String else { return nil }
        let value = raw.trimmingCharacters(in: .whitespaces)
        guard
            let url = URL(string: value),
            let scheme = url.scheme,
            ["http", "https"].contains(scheme),
            url.host() != nil
        else { return nil }
        return url
    }
}

extension URL {
    /// Appends an already-encoded path such as `/groups/123`, keeping any base path like `/api`.
    func joining(_ path: String) -> URL? {
        var base = absoluteString
        while base.hasSuffix("/") { base.removeLast() }
        return URL(string: base + (path.hasPrefix("/") ? path : "/" + path))
    }
}

extension String {
    /// Percent-encodes a value for use as one URL path segment.
    var pathSegment: String {
        addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? self
    }
}
