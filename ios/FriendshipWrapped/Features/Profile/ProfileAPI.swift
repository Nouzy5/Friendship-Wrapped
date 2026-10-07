import Foundation

private struct ProfileUserResponse: Decodable {
    let user: User
}

private struct DeleteAccountInput: Encodable {
    let password: String
}

extension APIClient {
    /// Multipart: the image in `avatar`. The server crops it to a 256 px square.
    func uploadAvatar(jpeg: Data) async throws -> User {
        var form = MultipartForm()
        form.addFile("avatar", filename: "avatar.jpg", mimeType: "image/jpeg", data: jpeg)
        let response: ProfileUserResponse = try await upload(.put, "/users/me/avatar", form: form)
        return response.user
    }

    func removeAvatar() async throws -> User {
        let response: ProfileUserResponse = try await send(.delete, "/users/me/avatar")
        return response.user
    }

    /// Permanently deletes your account and everything you posted; your password confirms it.
    /// A wrong password is a 400 with a `password` field error. The response clears the session cookie.
    func deleteAccount(password: String) async throws {
        try await perform(.delete, "/users/me", body: DeleteAccountInput(password: password))
    }
}
