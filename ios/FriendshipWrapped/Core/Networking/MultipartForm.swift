import Foundation

/// A multipart/form-data body, for photo, video and profile-picture uploads.
struct MultipartForm {
    let boundary = "FriendshipWrapped-\(UUID().uuidString)"

    private enum Part {
        case bytes(Data)
        /// Copied into the body as it is written, so a video never has to fit in memory.
        case file(URL)
    }

    private var parts: [Part] = []

    var contentType: String {
        "multipart/form-data; boundary=\(boundary)"
    }

    /// Whether any part is a file on disk. Send such a form with `write(to:)`, not `encoded()`.
    var containsFile: Bool {
        parts.contains { part in
            if case .file = part { return true }
            return false
        }
    }

    mutating func addField(_ name: String, value: String) {
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
        append(value)
        append("\r\n")
    }

    mutating func addFile(_ name: String, filename: String, mimeType: String, data: Data) {
        appendFileHeader(name, filename: filename, mimeType: mimeType)
        parts.append(.bytes(data))
        append("\r\n")
    }

    /// A file on disk (a video), read when the body is written.
    mutating func addFile(_ name: String, filename: String, mimeType: String, fileURL: URL) {
        appendFileHeader(name, filename: filename, mimeType: mimeType)
        parts.append(.file(fileURL))
        append("\r\n")
    }

    /// The finished body, with the closing boundary, in memory.
    func encoded() -> Data {
        var result = Data()
        for part in parts {
            switch part {
            case .bytes(let data):
                result.append(data)
            case .file(let url):
                result.append((try? Data(contentsOf: url)) ?? Data())
            }
        }
        result.append(closing)
        return result
    }

    /// Writes the finished body to a file, copying any file parts in pieces.
    func write(to destination: URL) throws {
        guard FileManager.default.createFile(atPath: destination.path, contents: nil) else {
            throw CocoaError(.fileWriteUnknown)
        }
        let output = try FileHandle(forWritingTo: destination)
        defer { try? output.close() }

        for part in parts {
            switch part {
            case .bytes(let data):
                try output.write(contentsOf: data)
            case .file(let url):
                let input = try FileHandle(forReadingFrom: url)
                defer { try? input.close() }
                while let chunk = try input.read(upToCount: 1 << 20), !chunk.isEmpty {
                    try output.write(contentsOf: chunk)
                }
            }
        }
        try output.write(contentsOf: closing)
    }

    private var closing: Data {
        Data("--\(boundary)--\r\n".utf8)
    }

    private mutating func appendFileHeader(_ name: String, filename: String, mimeType: String) {
        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
    }

    private mutating func append(_ string: String) {
        parts.append(.bytes(Data(string.utf8)))
    }
}
