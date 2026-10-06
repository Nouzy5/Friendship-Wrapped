import Foundation

/// Building and reading invite links: `https://<web>/invite/<token>` or `friendshipwrapped://invite/<token>`.
enum InviteLink {
    /// 16 random bytes, base64url-encoded (the server's INVITE_TOKEN_PATTERN).
    private static let tokenLength = 22
    private static let tokenCharacters = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
    )

    static func isValidToken(_ value: String) -> Bool {
        value.count == tokenLength && value.unicodeScalars.allSatisfy { tokenCharacters.contains($0) }
    }

    /// The link to share. It points at the web client so it works for everyone, app or not.
    static func url(for token: String) -> URL {
        if let web = AppConfig.webBaseURL, let url = web.joining("/invite/\(token)") {
            return url
        }
        return URL(string: "\(AppConfig.urlScheme)://invite/\(token)")!
    }

    /// The token from a pasted link or a bare token.
    static func token(from input: String) -> String? {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if isValidToken(trimmed) { return trimmed }
        guard let url = URL(string: trimmed) else { return nil }
        return token(from: url)
    }

    /// The token from a web link (`…/invite/<token>`) or a deep link (`friendshipwrapped://invite/<token>`).
    static func token(from url: URL) -> String? {
        var parts = url.pathComponents.filter { $0 != "/" }
        // In friendshipwrapped://invite/<token>, "invite" is the URL's host rather than part of its path.
        if url.scheme == AppConfig.urlScheme, url.host() == "invite" {
            parts.insert("invite", at: 0)
        }
        guard let index = parts.lastIndex(of: "invite"), index + 1 < parts.count else { return nil }
        let token = parts[index + 1]
        return isValidToken(token) ? token : nil
    }
}
