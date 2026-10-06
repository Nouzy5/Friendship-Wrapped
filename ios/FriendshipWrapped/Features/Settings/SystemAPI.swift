import Foundation

extension APIClient {
    func fetchHealth() async throws -> HealthReport {
        try await send(.get, "/health")
    }
}
