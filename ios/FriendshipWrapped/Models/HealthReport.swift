import Foundation

/// `GET /api/health`. When something is down the API answers 503 instead, with
/// `DATABASE_UNAVAILABLE` or `STORAGE_UNAVAILABLE` (the database is checked first).
struct HealthReport: Codable {
    struct Checks: Codable {
        let database: ServiceCheck
        /// Object storage for photos (Phase 4).
        let storage: ServiceCheck?
    }

    struct ServiceCheck: Codable {
        let status: String
        let latencyMs: Int?
    }

    let status: String
    let uptimeSeconds: Int
    let timestamp: String
    let checks: Checks
}
