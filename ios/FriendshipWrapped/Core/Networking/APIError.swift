import Foundation

/// One validation problem from the server's `details` array.
struct FieldIssue: Decodable, Equatable {
    let path: String
    let message: String
}

/// Mirrors the server's error envelope: `{ "error": { "code", "message", "details"? } }`.
struct APIError: LocalizedError, Equatable {
    let status: Int
    let code: String
    let message: String
    let issues: [FieldIssue]
    /// Extra facts some errors carry as `details` when it's an object of strings, e.g. who sent an
    /// expired invite. Empty for every other error.
    let info: [String: String]

    init(status: Int, code: String, message: String, issues: [FieldIssue] = [], info: [String: String] = [:]) {
        self.status = status
        self.code = code
        self.message = message
        self.issues = issues
        self.info = info
    }

    var errorDescription: String? { message }

    /// The server couldn't be reached at all (offline, server down).
    var isNetworkError: Bool { status == 0 }

    /// Per-field messages, e.g. `["username": "That username is already taken"]`. First message per field wins.
    var fieldErrors: [String: String] {
        var fields: [String: String] = [:]
        for issue in issues where !issue.path.isEmpty && fields[issue.path] == nil {
            fields[issue.path] = issue.message
        }
        return fields
    }

    /// A message for the whole form, or nil when every problem is already shown next to a field.
    var formMessage: String? {
        if issues.isEmpty { return message }
        return issues.first(where: { $0.path.isEmpty })?.message
    }

    static let network = APIError(
        status: 0,
        code: "NETWORK_ERROR",
        message: "Can't reach the server. Check your connection and try again."
    )

    static let notConfigured = APIError(
        status: 0,
        code: "NOT_CONFIGURED",
        message: "This build isn't connected to a server."
    )

    static let unexpected = APIError(
        status: -1,
        code: "UNEXPECTED",
        message: "Something went wrong. Please try again."
    )
}

extension Error {
    /// Any error as an `APIError`, so views can show one consistent message.
    var asAPIError: APIError {
        (self as? APIError) ?? .unexpected
    }
}
