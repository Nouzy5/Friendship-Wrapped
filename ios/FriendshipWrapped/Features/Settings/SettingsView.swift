import SwiftUI

struct SettingsView: View {
    @Environment(SessionStore.self) private var session

    @State private var confirmingLogout = false
    @State private var isLoggingOut = false
    @State private var alertMessage: String?

    var body: some View {
        Form {
            Section("Account") {
                LabeledContent("Signed in as", value: "@\(session.user?.username ?? "")")

                Button(role: .destructive) {
                    confirmingLogout = true
                } label: {
                    HStack {
                        Text(isLoggingOut ? "Logging out…" : "Log out")
                        if isLoggingOut {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(isLoggingOut)
            }

            SystemStatusSection()

            Section("About") {
                LabeledContent("Version", value: AppConfig.version)
                LabeledContent("Server", value: AppConfig.apiBaseURL?.host() ?? "Not configured")
            }
        }
        .navigationTitle("Settings")
        .confirmationDialog("Log out of Friendship Wrapped?", isPresented: $confirmingLogout, titleVisibility: .visible) {
            Button("Log out", role: .destructive) {
                Task { await logout() }
            }
        }
        .errorAlert("Couldn't log out", message: $alertMessage)
    }

    private func logout() async {
        isLoggingOut = true
        do {
            try await session.logout()
        } catch {
            alertMessage = error.asAPIError.message
        }
        isLoggingOut = false
    }
}

/// Live check of the app → API → database chain (the web app's System status card).
struct SystemStatusSection: View {
    private struct Service {
        let status: ServiceStatus
        var detail: String?
    }

    @State private var report: HealthReport?
    @State private var failure: APIError?
    @State private var isChecking = false

    var body: some View {
        Section {
            row("API server", api)
                .task { await check() }
            row("Database", database)
            row("Photo storage", storage)
        } header: {
            HStack {
                Text("System status")
                Spacer()
                Button(isChecking ? "Checking…" : "Recheck") {
                    Task { await check() }
                }
                .font(.caption.weight(.semibold))
                .textCase(nil)
                .disabled(isChecking)
            }
        } footer: {
            Text(summary)
        }
    }

    // The API checks the database first, so when it reports storage down the database was fine.
    private var databaseDown: Bool { failure?.code == "DATABASE_UNAVAILABLE" }
    private var storageDown: Bool { failure?.code == "STORAGE_UNAVAILABLE" }

    private var api: Service {
        if let report { return Service(status: .ok, detail: "up \(Format.uptime(report.uptimeSeconds))") }
        guard let failure else { return Service(status: .checking) }
        // The API answered, but told us what's down.
        if databaseDown || storageDown { return Service(status: .ok) }
        return Service(status: .down, detail: failure.message)
    }

    private var database: Service {
        if let report { return Service(status: .ok, detail: "\(report.checks.database.latencyMs ?? 0) ms") }
        guard let failure else { return Service(status: .checking) }
        if databaseDown { return Service(status: .down, detail: failure.message) }
        if storageDown { return Service(status: .ok) }
        return Service(status: .unknown)
    }

    private var storage: Service {
        if let report {
            guard let storage = report.checks.storage else { return Service(status: .unknown) }
            return Service(status: .ok, detail: "\(storage.latencyMs ?? 0) ms")
        }
        guard let failure else { return Service(status: .checking) }
        if storageDown { return Service(status: .down, detail: failure.message) }
        return Service(status: .unknown)
    }

    private var summary: String {
        if isChecking { return "Running checks…" }
        if api.status == .ok && database.status == .ok && storage.status == .ok { return "All systems connected." }
        return "Something isn't connected right now, so some features may not work."
    }

    private func row(_ title: String, _ service: Service) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                if let detail = service.detail {
                    Text(detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer()
            StatusIndicator(status: service.status)
        }
    }

    private func check() async {
        isChecking = true
        do {
            report = try await APIClient.shared.fetchHealth()
            failure = nil
        } catch is CancellationError {
            // Leave the previous result in place.
        } catch {
            failure = error.asAPIError
            report = nil
        }
        isChecking = false
    }
}
