import SwiftUI

struct SettingsView: View {
    @Environment(SessionStore.self) private var session

    @State private var confirmingLogout = false
    @State private var isLoggingOut = false
    @State private var deletingAccount = false
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

            Section {
                Button("Delete account…", role: .destructive) {
                    deletingAccount = true
                }
            } footer: {
                Text("Permanently deletes your account, your photos and everything else you've posted.")
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
        .sheet(isPresented: $deletingAccount) {
            DeleteAccountView()
        }
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

/// Whether the app's server, database and photo storage are reachable (the web app's App status
/// card): folded away unless something's wrong.
struct SystemStatusSection: View {
    private struct Service {
        let status: ServiceStatus
        var detail: String?
    }

    @State private var report: HealthReport?
    @State private var failure: APIError?
    @State private var isChecking = false
    @State private var expanded = false

    var body: some View {
        Section {
            DisclosureGroup(isExpanded: $expanded) {
                row("API server", api)
                row("Database", database)
                row("Photo storage", storage)
                HStack(spacing: 12) {
                    Text(summary)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 0)
                    Button(isChecking ? "Checking…" : "Recheck") {
                        Task { await check() }
                    }
                    .font(.footnote.weight(.semibold))
                    .buttonStyle(.borderless)
                    .disabled(isChecking)
                }
            } label: {
                // On the label, which is always on screen, so the check runs once.
                LabeledContent("App status", value: headline)
                    .task { await check() }
                    .onChange(of: isChecking) { _, checking in
                        // Opens by itself when a check finds something wrong.
                        if !checking, !allOK { expanded = true }
                    }
            }
        }
    }

    private var allOK: Bool {
        api.status == .ok && database.status == .ok && storage.status == .ok
    }

    private var headline: String {
        if isChecking { return "Checking…" }
        return allOK ? "Everything's working" : "Something's wrong"
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
        if allOK { return "All systems connected." }
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
