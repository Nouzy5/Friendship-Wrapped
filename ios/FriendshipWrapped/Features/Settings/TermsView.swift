import SwiftUI

/// Settings → Terms and privacy policy (the web app's TermsPage): the short version of how the
/// app treats you and your photos.
struct TermsAndPrivacyView: View {
    private struct Topic: Identifiable {
        let title: String
        let paragraphs: [String]
        var id: String { title }
    }

    private let topics = [
        Topic(title: "Who sees your photos", paragraphs: [
            "Only the people in the group you post to. Nothing is public, and there's no feed of strangers.",
            "Location is removed from every photo before it's stored. Friends can only save your photos if you let them (Privacy & safety).",
        ]),
        Topic(title: "What's stored", paragraphs: [
            "Your name, username, password (scrambled, never readable), profile photo, your groups, and the photos, reactions and comments you post.",
            "To keep you signed in we remember which devices you use; you can sign any of them out in Account.",
        ]),
        Topic(title: "Leaving", paragraphs: [
            "Download your photos any time from Account. Deleting your account deletes your photos, comments and reactions and takes you out of every group.",
        ]),
        Topic(title: "Being kind", paragraphs: [
            "Post only what the people in the photo would be happy to share with the group. Block or report anyone who makes it unpleasant.",
        ]),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                ForEach(Array(topics.enumerated()), id: \.element.id) { index, topic in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(topic.title)
                            .font(Theme.title(.title3))
                            .foregroundStyle(.fg)
                            .accessibilityAddTraits(.isHeader)
                        ForEach(topic.paragraphs, id: \.self) { paragraph in
                            Text(paragraph)
                                .font(.callout)
                                .foregroundStyle(.sub)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .riseIn(delay: Double(index) * 0.05)
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 8)
            .padding(.bottom, 40)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .screenBackground()
        .navigationTitle("Terms and privacy")
        .navigationBarTitleDisplayMode(.large)
    }
}
