import SwiftUI

/// A slide's content, in its own colours and motion (the web client's StorySlide).
struct StorySlideView: View {
    let slide: WrappedSlide
    let wrapped: Wrapped

    var body: some View {
        switch slide {
        case .intro:
            IntroSlide(wrapped: wrapped)
        case .photos(let total, let photographerCount):
            PhotosSlide(total: total, photographerCount: photographerCount)
        case .topPhotographer(let top, let runnersUp):
            TopPhotographerSlide(top: top, runnersUp: runnersUp)
        case .busiestMonth(let month, let count, let byMonth, let busiestDay):
            BusiestMonthSlide(month: month, count: count, byMonth: byMonth, busiestDay: busiestDay)
        case .mostReactedPhoto(let photo, let count):
            MostReactedPhotoSlide(photo: photo, count: count)
        case .reactions(let total, let comments, let topReactor):
            ReactionsSlide(total: total, comments: comments, topReactor: topReactor)
        case .collage(let photos):
            CollageSlide(photos: photos, year: wrapped.year)
        case .outro(let photos, let reactions, let comments, let people):
            OutroSlide(photos: photos, reactions: reactions, comments: comments, people: people, final: wrapped.final, year: wrapped.year)
        case .unknown:
            // Left out when decoding, so never shown.
            Color.ink950
        }
    }
}

// MARK: - Slides

private struct IntroSlide: View {
    let wrapped: Wrapped

    var body: some View {
        SlideFrame(tone: .sunset, centered: true) {
            VStack {
                Spacer()
                Text("Tap to skip ahead, hold to pause")
                    .font(.subheadline.weight(.semibold))
                    .opacity(0.7)
                    .rise(after: 1.6)
            }
            .padding(.bottom, 40)
        } content: {
            Text(wrapped.group.emoji)
                .font(.system(size: 60))
                .frame(width: 112, height: 112)
                .background(.white.opacity(0.25), in: Circle())
                .padding(8)
                .background(.white.opacity(0.15), in: Circle())
                .shadow(color: .black.opacity(0.25), radius: 24, y: 12)
                .pop()
                .accessibilityHidden(true)
            Text(wrapped.group.name)
                .font(.title3.bold())
                .rise(after: 0.25)
            VStack(spacing: 0) {
                Text("Your")
                    .font(.story(30))
                    .rise(after: 0.45)
                Text(verbatim: String(wrapped.year))
                    .font(.story(96))
                    .tracking(-3)
                    .rise(after: 0.6)
                Text("Wrapped")
                    .font(.story(48))
                    .rise(after: 0.75)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            if !wrapped.final {
                Text("The year so far: it isn't over yet")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(Color.ink950.opacity(0.15), in: Capsule())
                    .rise(after: 1.0)
            }
        }
    }
}

private struct PhotosSlide: View {
    let total: Int
    let photographerCount: Int

    var body: some View {
        SlideFrame(tone: .violet) {
            VStack(alignment: .leading, spacing: 8) {
                Text("You took")
                    .font(.story(30))
                    .rise()
                CountUp(value: total, delay: 0.2)
                    .font(bigNumberFont(total))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .rise(after: 0.2)
                Text("\(Format.noun(total, "photo")) together.")
                    .font(.story(30))
                    .rise(after: 0.4)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            if photographerCount > 1 {
                Text("\(Format.number(photographerCount)) of you shared them.")
                    .font(.title3.weight(.semibold))
                    .opacity(0.85)
                    .rise(after: 1.7)
            }
        }
    }
}

private struct TopPhotographerSlide: View {
    let top: YearStats.PersonCount
    let runnersUp: [YearStats.PersonCount]

    @Environment(SessionStore.self) private var session

    var body: some View {
        SlideFrame(tone: .gold) {
            Kicker(text: "Behind the lens")
                .rise()
            AvatarView(name: top.user.displayName, seed: top.user.id, imagePath: top.user.avatarUrl, size: 96)
                .padding(8)
                .background(.white.opacity(0.4), in: Circle())
                .overlay(alignment: .top) {
                    Text("👑")
                        .font(.system(size: 36))
                        .rotationEffect(.degrees(-12))
                        .offset(y: -30)
                        .accessibilityHidden(true)
                }
                .padding(.top, 16)
                .pop(after: 0.15)
            Text("\(name(of: top)) took the most photos.")
                .font(.story(36))
                .minimumScaleFactor(0.6)
                .accessibilityAddTraits(.isHeader)
                .rise(after: 0.35)
            CountUp(value: top.count, delay: 0.55) { "\(Format.number($0)) \(Format.noun(top.count, "photo"))" }
                .font(.title2.bold())
                .rise(after: 0.55)
            if !runnersUp.isEmpty {
                VStack(spacing: 8) {
                    ForEach(Array(runnersUp.enumerated()), id: \.element.id) { offset, person in
                        RunnerUpRow(rank: offset + 2, name: name(of: person), person: person)
                    }
                }
                .rise(after: 1.0)
            }
        }
    }

    private func name(of person: YearStats.PersonCount) -> String {
        person.user.id == session.user?.id ? "You" : person.user.displayName
    }
}

private struct RunnerUpRow: View {
    let rank: Int
    let name: String
    let person: YearStats.PersonCount

    var body: some View {
        HStack(spacing: 12) {
            Text(verbatim: String(rank))
                .font(.subheadline.weight(.black))
                .frame(width: 16)
            AvatarView(name: person.user.displayName, seed: person.user.id, imagePath: person.user.avatarUrl, size: 32)
            Text(name)
                .fontWeight(.semibold)
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(Format.number(person.count)) \(Format.noun(person.count, "photo"))")
                .font(.subheadline.bold())
                .monospacedDigit()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.ink950.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
        .accessibilityElement(children: .combine)
    }
}

private struct BusiestMonthSlide: View {
    /// 1–12.
    let month: Int
    let count: Int
    let byMonth: [Int]
    let busiestDay: YearStats.DayCount?

    var body: some View {
        SlideFrame(tone: .ocean) {
            Kicker(text: "Month by month")
                .rise()
            Text("\(StoryDate.monthName(month)) was your biggest month.")
                .font(.story(48))
                .minimumScaleFactor(0.6)
                .accessibilityAddTraits(.isHeader)
                .rise(after: 0.15)
            MonthChart(byMonth: byMonth, highlighted: month)
            CountUp(value: count, delay: 1.2) {
                "\(Format.number($0)) \(Format.noun(count, "photo")) in \(StoryDate.monthName(month))"
            }
            .font(.title2.bold())
            .rise(after: 1.2)
            if let busiestDay, busiestDay.count > 1, let day = StoryDate.dayName(busiestDay.date) {
                Text("Your busiest day was \(day), with \(Format.number(busiestDay.count)) photos.")
                    .font(.system(size: 18))
                    .opacity(0.85)
                    .rise(after: 1.7)
            }
        }
    }
}

/// Twelve bars, January first, growing in one after another.
private struct MonthChart: View {
    let byMonth: [Int]
    /// The busiest month, 1–12.
    let highlighted: Int

    var body: some View {
        let most = max(byMonth.max() ?? 0, 1)
        HStack(alignment: .bottom, spacing: 6) {
            ForEach(Array(byMonth.enumerated()), id: \.offset) { index, photos in
                VStack(spacing: 6) {
                    MonthBar(
                        fraction: photos == 0 ? 0 : max(0.06, Double(photos) / Double(most)),
                        highlighted: index + 1 == highlighted,
                        delay: 0.4 + Double(index) * 0.06
                    )
                    .frame(height: 112)
                    Text(StoryDate.narrowMonthName(index + 1))
                        .font(.caption.bold())
                        .opacity(index + 1 == highlighted ? 1 : 0.6)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }
}

private struct MonthBar: View {
    /// Of the chart's height; 0 shows a thin line.
    let fraction: Double
    let highlighted: Bool
    let delay: Double

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var grown = false

    var body: some View {
        GeometryReader { geometry in
            UnevenRoundedRectangle(topLeadingRadius: 6, topTrailingRadius: 6)
                .fill(highlighted ? Color.white : Color.white.opacity(0.3))
                .frame(height: fraction == 0 ? 2 : geometry.size.height * fraction)
                .scaleEffect(x: 1, y: grown || reduceMotion ? 1 : 0.001, anchor: .bottom)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
        }
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.9).delay(delay)) {
                grown = true
            }
        }
    }
}

private struct MostReactedPhotoSlide: View {
    let photo: Photo
    let count: Int

    /// The reactions it got, most first; ties keep the usual order.
    private var breakdown: [ReactionType] {
        let order = ReactionType.allCases
        return order
            .filter { photo.reactions.count($0) > 0 }
            .sorted { first, second in
                let firstCount = photo.reactions.count(first)
                let secondCount = photo.reactions.count(second)
                if firstCount != secondCount { return firstCount > secondCount }
                return (order.firstIndex(of: first) ?? 0) < (order.firstIndex(of: second) ?? 0)
            }
    }

    var body: some View {
        SlideFrame(tone: .night) {
            Glow(color: .brandRose.opacity(0.3))
        } content: {
            Kicker(text: "Crowd favorite")
                .rise()
            Text("Your most reacted-to photo")
                .font(.story(30))
                .accessibilityAddTraits(.isHeader)
                .rise(after: 0.15)
            AuthenticatedImage(path: photo.imageUrls.medium) {
                Color.white.opacity(0.08)
            }
            .aspectRatio(photo.aspectRatio, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .padding(6)
            .background(.white, in: RoundedRectangle(cornerRadius: 16))
            .rotationEffect(.degrees(-2))
            .shadow(color: .brandRose.opacity(0.3), radius: 30, y: 12)
            // As big as fits, but never taller than about 40% of the screen.
            .frame(maxWidth: .infinity, maxHeight: 360)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(photo.altText)
            .accessibilityAddTraits(.isImage)
            .pop(after: 0.35)
            VStack(alignment: .leading, spacing: 4) {
                CountUp(value: count, delay: 0.85) { "\(Format.number($0)) \(Format.noun(count, "reaction"))" }
                    .font(.story(30))
                if !breakdown.isEmpty {
                    HStack(spacing: 12) {
                        ForEach(breakdown) { type in
                            Text("\(type.emoji) \(Format.number(photo.reactions.count(type)))")
                                .accessibilityLabel("\(type.label): \(Format.number(photo.reactions.count(type)))")
                        }
                    }
                    .font(.system(size: 18, weight: .semibold))
                }
                Text("by \(photo.uploader.displayName) · \(Format.dayMonth(photo.createdAt))")
                    .font(.subheadline)
                    .opacity(0.7)
                    .padding(.top, 4)
            }
            .rise(after: 0.85)
        }
    }
}

private struct ReactionsSlide: View {
    let total: Int
    let comments: Int
    let topReactor: YearStats.PersonCount?

    @Environment(SessionStore.self) private var session

    var body: some View {
        SlideFrame(tone: .berry) {
            FloatingReactions()
        } content: {
            VStack(alignment: .leading, spacing: 8) {
                Text("You sent")
                    .font(.story(30))
                    .rise()
                CountUp(value: total, delay: 0.2)
                    .font(bigNumberFont(total))
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .rise(after: 0.2)
                Text("\(Format.noun(total, "reaction")).")
                    .font(.story(30))
                    .rise(after: 0.4)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            if comments > 0 {
                CountUp(value: comments, delay: 1.6, duration: 0.9) {
                    "…and wrote \(Format.number($0)) \(Format.noun(comments, "comment"))."
                }
                .font(.title3.bold())
                .rise(after: 1.6)
            }
            if let topReactor {
                HStack(spacing: 12) {
                    AvatarView(
                        name: topReactor.user.displayName,
                        seed: topReactor.user.id,
                        imagePath: topReactor.user.avatarUrl,
                        size: 48
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(name(of: topReactor)) reacted the most")
                            .bold()
                            .lineLimit(1)
                        Text("\(Format.number(topReactor.count)) \(Format.noun(topReactor.count, "reaction"))")
                            .font(.subheadline)
                            .opacity(0.8)
                    }
                    Spacer(minLength: 0)
                }
                .padding(12)
                .background(Color.ink950.opacity(0.25), in: RoundedRectangle(cornerRadius: 16))
                .accessibilityElement(children: .combine)
                .rise(after: 2.2)
            }
        }
    }

    private func name(of person: YearStats.PersonCount) -> String {
        person.user.id == session.user?.id ? "You" : person.user.displayName
    }
}

/// Reactions drifting up the screen, at fixed places so it looks the same every time.
private struct FloatingReactions: View {
    private static let floaters: [(x: Double, delay: Double)] = [
        (0.06, 0), (0.22, 1.6), (0.38, 0.8), (0.54, 2.4),
        (0.70, 0.4), (0.86, 2), (0.14, 3), (0.62, 3.4),
    ]
    /// Seconds for one trip up the screen.
    private static let cycle = 4.0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.storyClock) private var clock

    var body: some View {
        if !reduceMotion {
            GeometryReader { geometry in
                // Runs on the slide's clock, so it freezes while the story is paused.
                TimelineView(.animation(minimumInterval: 1.0 / 30, paused: clock.isPaused)) { context in
                    let elapsed = clock.elapsed(at: context.date)
                    ZStack(alignment: .topLeading) {
                        ForEach(Self.floaters.indices, id: \.self) { index in
                            floater(index, elapsed: elapsed, in: geometry.size)
                        }
                    }
                }
            }
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
        }
    }

    private func floater(_ index: Int, elapsed: TimeInterval, in size: CGSize) -> some View {
        let floater = Self.floaters[index]
        let running = elapsed - floater.delay
        let phase = running < 0 ? 0 : running.truncatingRemainder(dividingBy: Self.cycle) / Self.cycle
        // Eases in: slow at the bottom, faster as it rises. Fades in quickly, then out.
        let rise = phase * phase
        let opacity = running < 0 ? 0 : (phase < 0.15 ? phase / 0.15 : 1 - (phase - 0.15) / 0.85)
        let reactions = ReactionType.allCases
        return Text(reactions[index % reactions.count].emoji)
            .font(.system(size: 36))
            .scaleEffect(0.6 + 0.55 * rise)
            .opacity(opacity)
            .position(x: size.width * floater.x + 18, y: size.height + 40 - size.height * 0.7 * rise)
    }
}

private struct CollageSlide: View {
    let photos: [Photo]
    let year: Int

    private static let tilts: [Double] = [-3, 2, -1.5, 2.5, -2, 1.5, -2.5, 3, -1]

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 12), count: photos.count <= 4 ? 2 : 3)
    }

    var body: some View {
        SlideFrame(tone: .night, centered: true) {
            Glow(color: .brandGold.opacity(0.2))
        } content: {
            Kicker(text: "\(year) in pictures")
                .rise()
            Text("Moments to remember")
                .font(.story(30))
                .accessibilityAddTraits(.isHeader)
                .rise(after: 0.15)
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                    CollagePhoto(photo: photo)
                        .pop(after: 0.35 + Double(index) * 0.14)
                        .rotationEffect(.degrees(Self.tilts[index % Self.tilts.count]))
                }
            }
        }
    }
}

private struct CollagePhoto: View {
    let photo: Photo

    var body: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                AuthenticatedImage(path: photo.imageUrls.thumbnail) {
                    Color.white.opacity(0.08)
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding(4)
            .background(.white, in: RoundedRectangle(cornerRadius: 12))
            .shadow(color: .black.opacity(0.4), radius: 12, y: 6)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(photo.altText)
            .accessibilityAddTraits(.isImage)
    }
}

private struct OutroSlide: View {
    let photos: Int
    let reactions: Int
    let comments: Int
    let people: Int
    let final: Bool
    let year: Int

    private struct Total: Identifiable {
        let value: Int
        let label: String

        var id: String { label }
    }

    private var totals: [Total] {
        [
            Total(value: photos, label: Format.noun(photos, "photo")),
            Total(value: reactions, label: Format.noun(reactions, "reaction")),
            Total(value: comments, label: Format.noun(comments, "comment")),
            Total(value: people, label: Format.noun(people, "friend")),
        ]
    }

    var body: some View {
        // Leaves room at the bottom for Watch again and Done, which the story draws on top.
        SlideFrame(tone: .sunset, centered: true, bottomInset: 120) {
            Text("❤️")
                .font(.system(size: 72))
                .pop()
                .accessibilityHidden(true)
            Text("That's your year together.")
                .font(.story(36))
                .minimumScaleFactor(0.6)
                .accessibilityAddTraits(.isHeader)
                .rise(after: 0.2)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(totals) { total in
                    VStack(spacing: 2) {
                        CountUp(value: total.value, delay: 0.5, duration: 1.0)
                            .font(.story(30))
                        Text(total.label)
                            .font(.subheadline.weight(.semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(Color.ink950.opacity(0.1), in: RoundedRectangle(cornerRadius: 16))
                    .accessibilityElement(children: .combine)
                }
            }
            .rise(after: 0.5)
            if !final {
                Text("And \(String(year)) isn't over yet. Keep them coming.")
                    .font(.headline)
                    .rise(after: 0.9)
            }
        }
    }
}

// MARK: - Building blocks

private enum StoryTone {
    case sunset, violet, gold, ocean, night, berry

    /// The web client's Tailwind gradients.
    var colors: [Color] {
        switch self {
        case .sunset: return [.brandRose, .brandOrange, .brandGold]
        case .violet: return [Color(hex: 0x6D28D9), Color(hex: 0xC026D3), .brandRose]
        case .gold: return [.brandGold, .brandOrange, .brandRose]
        case .ocean: return [Color(hex: 0x0284C7), Color(hex: 0x4F46E5), Color(hex: 0x5B21B6)]
        case .night: return [.ink950]
        case .berry: return [.brandRose, Color(hex: 0xBE123C), Color(hex: 0x4C1D95)]
        }
    }

    /// Dark text on the bright gradients, light on the rest.
    var foreground: Color {
        switch self {
        case .sunset, .gold: return .ink950
        case .violet, .ocean, .night, .berry: return .ink50
        }
    }
}

private struct StoryBackground: View {
    let tone: StoryTone

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.storyClock) private var clock

    var body: some View {
        if tone == .sunset, !reduceMotion {
            // The sunset drifts slowly back and forth across a gradient twice the screen's size,
            // on the slide's clock, so it freezes while the story is paused.
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: clock.isPaused)) { context in
                let seconds = clock.elapsed(at: context.date)
                let shift = (1 - cos(seconds / 6 * .pi)) / 2
                LinearGradient(
                    colors: tone.colors,
                    startPoint: UnitPoint(x: -shift, y: -shift),
                    endPoint: UnitPoint(x: 2 - shift, y: 2 - shift)
                )
            }
        } else if tone.colors.count == 1 {
            tone.colors[0]
        } else {
            LinearGradient(colors: tone.colors, startPoint: .topLeading, endPoint: .bottomTrailing)
        }
    }
}

/// A full-screen slide: coloured background, content clear of the progress bar at the top.
private struct SlideFrame<Decoration: View, Content: View>: View {
    let tone: StoryTone
    let centered: Bool
    let bottomInset: CGFloat
    let decoration: Decoration
    let content: Content

    init(
        tone: StoryTone,
        centered: Bool = false,
        bottomInset: CGFloat = 48,
        @ViewBuilder decoration: () -> Decoration,
        @ViewBuilder content: () -> Content
    ) {
        self.tone = tone
        self.centered = centered
        self.bottomInset = bottomInset
        self.decoration = decoration()
        self.content = content()
    }

    var body: some View {
        ZStack {
            StoryBackground(tone: tone)
                .ignoresSafeArea()
            decoration
            VStack(alignment: centered ? .center : .leading, spacing: 24) {
                content
            }
            .multilineTextAlignment(centered ? .center : .leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: centered ? .center : .leading)
            .padding(.horizontal, 28)
            .padding(.top, 88)
            .padding(.bottom, bottomInset)
        }
        .foregroundStyle(tone.foreground)
    }
}

extension SlideFrame where Decoration == EmptyView {
    init(tone: StoryTone, centered: Bool = false, bottomInset: CGFloat = 48, @ViewBuilder content: () -> Content) {
        self.init(tone: tone, centered: centered, bottomInset: bottomInset, decoration: { EmptyView() }, content: content)
    }
}

/// A soft blurred light behind the top of a dark slide.
private struct Glow: View {
    let color: Color

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 384, height: 384)
            .blur(radius: 64)
            .offset(y: -96)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .ignoresSafeArea()
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}

private struct Kicker: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.subheadline.bold())
            .tracking(2.8)
            .textCase(.uppercase)
            .opacity(0.8)
    }
}

/// Text whose number counts up while the words around it stay put.
private struct CountingText: View, Animatable {
    var value: Double
    let format: (Int) -> String

    var animatableData: Double {
        get { value }
        set { value = newValue }
    }

    var body: some View {
        Text(format(Int(value.rounded())))
    }
}

/// Counts up from zero to `value` as it appears. VoiceOver reads the final number straight
/// away; with Reduce Motion, everyone sees it.
private struct CountUp: View {
    let value: Int
    var delay: Double = 0
    var duration: Double = 1.4
    var format: (Int) -> String = { Format.number($0) }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var counted = false

    var body: some View {
        CountingText(value: counted || reduceMotion ? Double(value) : 0, format: format)
            .monospacedDigit()
            .onAppear {
                guard !reduceMotion else { return }
                // Ease-out cubic, like the web story.
                withAnimation(.timingCurve(0.33, 1, 0.68, 1, duration: duration).delay(delay)) {
                    counted = true
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(format(value))
    }
}

/// Big numbers get as large as fits the width of a phone.
private func bigNumberFont(_ value: Int) -> Font {
    let length = Format.number(value).count
    let size: CGFloat = length <= 3 ? 128 : length <= 5 ? 96 : length <= 7 ? 72 : 60
    return .story(size)
}

/// Month and day names, in the viewer's language.
private enum StoryDate {
    private static let formatter = DateFormatter()

    /// "March" for 3.
    static func monthName(_ month: Int) -> String {
        name(month, in: formatter.standaloneMonthSymbols)
    }

    /// "M" for 3.
    static func narrowMonthName(_ month: Int) -> String {
        name(month, in: formatter.veryShortStandaloneMonthSymbols)
    }

    /// "Saturday 14 June" for "2026-06-14".
    static func dayName(_ date: String) -> String? {
        let parts = date.split(separator: "-").compactMap { Int($0) }
        guard
            parts.count == 3,
            let day = Calendar.current.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
        else { return nil }
        return day.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }

    private static func name(_ month: Int, in names: [String]?) -> String {
        guard let names, names.indices.contains(month - 1) else { return "" }
        return names[month - 1]
    }
}

private extension Font {
    /// The story's display type: heavy, for headlines and big numbers.
    static func story(_ size: CGFloat) -> Font {
        .system(size: size, weight: .black)
    }
}

// MARK: - Motion

extension View {
    /// Fades and slides up into place after `delay` seconds (instantly with Reduce Motion).
    func rise(after delay: Double = 0) -> some View {
        modifier(RiseModifier(delay: delay))
    }

    /// Pops in from half size with a little bounce after `delay` seconds.
    func pop(after delay: Double = 0) -> some View {
        modifier(PopModifier(delay: delay))
    }
}

private struct RiseModifier: ViewModifier {
    let delay: Double

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let visible = shown || reduceMotion
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible ? 0 : 20)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.7).delay(delay)) {
                    shown = true
                }
            }
    }
}

private struct PopModifier: ViewModifier {
    let delay: Double

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let visible = shown || reduceMotion
        content
            .opacity(visible ? 1 : 0)
            .scaleEffect(visible ? 1 : 0.5)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.spring(duration: 0.7, bounce: 0.45).delay(delay)) {
                    shown = true
                }
            }
    }
}
