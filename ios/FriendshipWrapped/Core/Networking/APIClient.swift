import Foundation

enum HTTPMethod: String {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"
}

extension Notification.Name {
    /// Posted when the API rejects a request because the session is missing or expired.
    static let sessionDidExpire = Notification.Name("FriendshipWrapped.sessionDidExpire")
}

/// Talks to the same Express API as the web client and throws `APIError` on failure.
/// Feature endpoints live in extensions next to each feature (AuthAPI, GroupsAPI, …).
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let tokens: SessionTokenStore
    private let encoder = JSONEncoder()
    private let decoder: JSONDecoder

    init(tokens: SessionTokenStore = .shared) {
        let configuration = URLSessionConfiguration.ephemeral
        // Cookies are handled by hand so the session token lives in the Keychain.
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 20
        session = URLSession(configuration: configuration)
        self.tokens = tokens

        // The API sends dates as ISO 8601 with milliseconds (`Date.toISOString()`).
        let jsonDecoder = JSONDecoder()
        jsonDecoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(string) { return date }
            if let date = try? Date.ISO8601FormatStyle().parse(string) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Not an ISO 8601 date: \(string)")
        }
        decoder = jsonDecoder
    }

    // MARK: - Requests

    /// Sends a request and decodes its JSON response.
    func send<Response: Decodable>(_ method: HTTPMethod, _ path: String, body: (any Encodable)? = nil) async throws -> Response {
        let data = try await perform(method, path, body: body)
        return try decode(Response.self, from: data)
    }

    /// Sends a request whose response body isn't needed (e.g. 204 No Content).
    @discardableResult
    func perform(_ method: HTTPMethod, _ path: String, body: (any Encodable)? = nil) async throws -> Data {
        var request = try makeRequest(method, url: apiURL(path))
        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        return try await execute(request)
    }

    /// Uploads a multipart form (photos, profile pictures) and decodes the JSON response.
    /// `progress` gets the fraction sent so far (0–1), on a background queue.
    func upload<Response: Decodable>(
        _ method: HTTPMethod,
        _ path: String,
        form: MultipartForm,
        progress: (@Sendable (Double) -> Void)? = nil
    ) async throws -> Response {
        var request = try makeRequest(method, url: apiURL(path))
        request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 120
        let data = try await execute(request, uploading: form.encoded(), progress: progress)
        return try decode(Response.self, from: data)
    }

    /// Downloads an image the API serves at a server path, e.g. `/api/photos/<id>/images/thumbnail`.
    func imageData(atServerPath path: String) async throws -> Data {
        guard let baseURL = AppConfig.apiBaseURL else { throw APIError.notConfigured }
        // Only follow paths on the API's own host: the session cookie must never go anywhere else.
        guard
            path.hasPrefix("/"),
            !path.hasPrefix("//"),
            let url = URL(string: path, relativeTo: baseURL)?.absoluteURL,
            url.host() == baseURL.host()
        else { throw APIError.unexpected }

        var request = makeRequest(.get, url: url)
        request.setValue("image/*", forHTTPHeaderField: "Accept")
        return try await execute(request)
    }

    /// Downloads a file the API serves (your photo archive) to a temporary file with this name,
    /// for sharing or saving to Files.
    func downloadFile(_ path: String, named filename: String) async throws -> URL {
        var request = try makeRequest(.get, url: apiURL(path))
        request.setValue("*/*", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 600
        let result: (URL, URLResponse)
        do {
            result = try await session.download(for: request)
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
            throw APIError.network
        }
        let (location, response) = result
        guard let http = response as? HTTPURLResponse else { throw APIError.network }
        guard (200..<300).contains(http.statusCode) else {
            throw makeError(status: http.statusCode, data: (try? Data(contentsOf: location)) ?? Data())
        }
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: location, to: destination)
        return destination
    }

    /// Forgets the session token on this device.
    func clearSession() {
        tokens.clear()
    }

    // MARK: - Plumbing

    private func apiURL(_ path: String) throws -> URL {
        guard let baseURL = AppConfig.apiBaseURL else { throw APIError.notConfigured }
        guard let url = baseURL.joining(path) else { throw APIError.unexpected }
        return url
    }

    private func makeRequest(_ method: HTTPMethod, url: URL) -> URLRequest {
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let cookie = tokens.cookieHeader {
            request.setValue(cookie, forHTTPHeaderField: "Cookie")
        }
        return request
    }

    /// Sends the request (with `body` as an upload, if given) and returns the response body,
    /// or throws the API's error.
    private func execute(
        _ request: URLRequest,
        uploading body: Data? = nil,
        progress: (@Sendable (Double) -> Void)? = nil
    ) async throws -> Data {
        let result: (Data, URLResponse)
        do {
            if let body {
                let delegate = progress.map { UploadProgressDelegate(onProgress: $0) }
                result = try await session.upload(for: request, from: body, delegate: delegate)
            } else {
                result = try await session.data(for: request)
            }
        } catch {
            if Task.isCancelled || (error as? URLError)?.code == .cancelled { throw CancellationError() }
            throw APIError.network
        }
        let (data, response) = result

        guard let http = response as? HTTPURLResponse else { throw APIError.network }
        // A slow request sent with an older session (an upload started before signing in again)
        // mustn't renew, clear or end the current one. Decided before the cookie is handled,
        // since clearing it would make the current session look different.
        let sentWithCurrentSession = request.value(forHTTPHeaderField: "Cookie") == tokens.cookieHeader
        if sentWithCurrentSession, let url = request.url {
            rememberSessionCookie(from: http, url: url)
        }

        guard (200..<300).contains(http.statusCode) else {
            let error = makeError(status: http.statusCode, data: data)
            if error.status == 401 && error.code == "UNAUTHORIZED" && sentWithCurrentSession {
                tokens.clear()
                NotificationCenter.default.post(name: .sessionDidExpire, object: nil)
            }
            throw error
        }

        return data
    }

    private func decode<Response: Decodable>(_ type: Response.Type, from data: Data) throws -> Response {
        do {
            return try decoder.decode(type, from: data)
        } catch {
            throw APIError(status: -1, code: "BAD_RESPONSE", message: "The server sent a response the app didn't understand.")
        }
    }

    /// The server sets, renews (sliding expiry) and clears the session through `Set-Cookie`.
    private func rememberSessionCookie(from response: HTTPURLResponse, url: URL) {
        guard let header = response.value(forHTTPHeaderField: "Set-Cookie") else { return }
        let cookies = HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: url)
        guard let cookie = cookies.first(where: { SessionTokenStore.cookieNames.contains($0.name) }) else { return }

        // The server clears the cookie by dating it 1 January 1970. Comparing with the phone's
        // clock instead would throw a fresh session away when that clock is far ahead.
        let cleared = cookie.expiresDate.map { $0 < Date(timeIntervalSince1970: 86_400) } ?? false
        if cookie.value.isEmpty || cleared {
            tokens.clear()
        } else {
            tokens.save(name: cookie.name, value: cookie.value)
        }
    }

    private func makeError(status: Int, data: Data) -> APIError {
        guard let body = (try? decoder.decode(ErrorEnvelope.self, from: data))?.error else {
            // A 5xx without the API's JSON envelope usually means a proxy couldn't reach the API.
            if status >= 500 { return .network }
            return APIError(status: status, code: "HTTP_ERROR", message: "Request failed with status \(status)")
        }

        return APIError(
            status: status,
            code: body.code ?? "HTTP_ERROR",
            message: body.message ?? "Request failed with status \(status)",
            issues: body.details ?? []
        )
    }
}

/// Reports how much of an upload has been sent.
private final class UploadProgressDelegate: NSObject, URLSessionTaskDelegate {
    private let onProgress: @Sendable (Double) -> Void

    init(onProgress: @escaping @Sendable (Double) -> Void) {
        self.onProgress = onProgress
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard totalBytesExpectedToSend > 0 else { return }
        onProgress(min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend)))
    }
}

private struct ErrorEnvelope: Decodable {
    struct Body: Decodable {
        let code: String?
        let message: String?
        let details: [FieldIssue]?

        enum CodingKeys: String, CodingKey {
            case code, message, details
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            code = try container.decodeIfPresent(String.self, forKey: .code)
            message = try container.decodeIfPresent(String.self, forKey: .message)
            // `details` is only a list of field issues for validation errors; ignore any other shape.
            details = try? container.decodeIfPresent([FieldIssue].self, forKey: .details)
        }
    }

    let error: Body?
}
