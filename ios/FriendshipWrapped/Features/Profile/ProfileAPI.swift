import Foundation

private struct ProfileUserResponse: Decodable {
    let user: User
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
}
