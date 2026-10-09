import SwiftUI

// The Wrapped story's slides (the web app's StorySlide), in the "Colour-coded" look: paper (the
// app's own light or dark), night (black), or flooded in one person's colour when the slide is
// about them. Colour still only ever means a person: everyone's bars, dots and stickers are theirs.

// MARK: - Tones

/// A slide's colours. The story's progress bar and buttons take its ink.
struct StoryTone: Equatable {
    let background: Color
    let ink: Color
    /// Quieter text: the year in the story's header, the busiest day.
    let secondary: Color

    static let paper = StoryTone(background: Theme.bg, ink: Theme.fg, secondary: Theme.sub)
    static let night = StoryTone(background: .black, ink: .white, secondary: Color(hex: 0xA8A8A4))

    /// Flooded in someone's colour (neutral grey for people without one).
    static func person(_ color: MemberColor?) -> StoryTone {
        let fill = MemberFill(color)
        return StoryTone(background: fill.background, ink: fill.ink, secondary: fill.ink)
    }

    /// The slide's tone. `colorOf` gives a person's colour in the group, for slides that only
    /// carry their id; `me` is who's watching, for the slide that is about them.
    static func of(_ slide: WrappedSlide, me: String? = nil, colorOf: (String) -> MemberColor?) -> StoryTone {
        switch slide {
        case .you:
            return .person(me.flatMap(colorOf))
        case .topPhotographer(let top, _):
            return .person(top.color ?? colorOf(top.user.id))
        case .mostReactedPhoto(let photo, _):
            return .person(colorOf(photo.uploader.id))
        case .busiestMonth, .collage:
            return .night
        default:
            return .paper
        }
    }
}

// MARK: - The slide

/// A slide's content, in its own colours and motion.
struct StorySlideView: View {
    let slide: WrappedSlide
    let wrapped: Wrapped
    /// The story's size, for things laid out to fit it (big numbers, the month chart, the bars).
    let size: CGSize

    @Environment(GroupsStore.self) private var groups
    @Environment(SessionStore.self) private var session

    var body: some View {
        let slideTone = StoryTone.of(slide, me: session.user?.id) { userID in groups.colorOf(userID, in: wrapped.group.id) }

        switch slide {
        case .intro:
            IntroSlide(wrapped: wrapped, tone: slideTone, size: size)
        case .photos(let total, let photographerCount, let byUser):
            PhotosSlide(total: total, photographerCount: photographerCount, byUser: byUser, tone: slideTone, size: size)
        case .topPhotographer(let top, let runnersUp):
            TopPhotographerSlide(top: top, runnersUp: runnersUp, tone: slideTone, size: size)
        case .busiestMonth(let month, let count, let byMonth, let busiestDay, let byUser):
            BusiestMonthSlide(
                month: month,
                count: count,
                byMonth: byMonth,
                busiestDay: busiestDay,
                byUser: byUser,
                tone: slideTone,
                size: size
            )
        case .mostReactedPhoto(let photo, let count):
            MostReactedPhotoSlide(photo: photo, count: count, groupID: wrapped.group.id, tone: slideTone, size: size)
        case .reactions(let total, let comments, let topReactor):
            ReactionsSlide(total: total, comments: comments, topReactor: topReactor, tone: slideTone, size: size)
        case .collage(let photos):
            CollageSlide(photos: photos, year: wrapped.year, tone: slideTone, size: size)
        case .you(let yours):
            YouSlide(yours: yours, year: wrapped.year, tone: slideTone, size: size)
        case .outro(let photos, let reactions, let comments, let people):
            OutroSlide(
                photos: photos,
                reactions: reactions,
                comments: comments,
                people: people,
                wrapped: wrapped,
                tone: slideTone,
                size: size
            )
        case .unknown:
            // Left out when decoding, so never shown.
            slideTone.background.ignoresSafeArea()
        }
    }
}

// MARK: - Slides

private struct IntroSlide: View {
    let wrapped: Wrapped
    let tone: StoryTone
    let size: CGSize

    @Environment(GroupsStore.self) private var groups

    /// As big as fits: 30% of the story's width, between 72 and 104 points.
    private var yearSize: CGFloat { min(104, max(72, size.width * 0.3)) }

    var body: some View {
        SlideFrame(tone: tone, centered: true, decoration: AnyView(hint)) {
            GroupBadge(
                groupID: wrapped.group.id,
                emoji: wrapped.group.emoji,
                avatarURL: groups.group(wrapped.group.id)?.avatarUrl,
                size: 128
            )
            .storyPop()
            Text(wrapped.group.name)
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .storyRise(after: 0.25)
            VStack(spacing: 0) {
                Text("Your")
                    .font(.story(30))
                    .storyRise(after: 0.45)
                Text(verbatim: String(wrapped.year))
                    .font(Theme.display(size: yearSize))
                    .tracking(-yearSize * 0.025)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    .storyRise(after: 0.6)
                Text("Wrapped")
                    .font(.story(48))
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .storyRise(after: 0.75)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            if !wrapped.final {
                Text("The year so far: it isn't over yet")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .padding(.horizontal, 16)
                    .padding(.vertical, 6)
                    .background(.surface, in: Capsule())
                    .storyRise(after: 1.0)
            }
        }
    }

    private var hint: some View {
        Text("Tap to skip ahead, hold to pause")
            .font(.system(size: 14, design: .rounded))
            .foregroundStyle(tone.secondary)
            .storyRise(after: 1.6)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
            .padding(.bottom, 40)
    }
}

private struct PhotosSlide: View {
    let total: Int
    let photographerCount: Int
    /// Everyone who posted, most first (minus anyone who keeps their name out of Wrapped).
    let byUser: [YearStats.PersonCount]
    let tone: StoryTone
    let size: CGSize

    private var splitLine: String {
        "\(Format.number(photographerCount)) of you shot them." + (byUser.count > 1 ? " Here's how they split." : "")
    }

    var body: some View {
        let bigSize = storyBigNumberSize(total, width: size.width)

        SlideFrame(
            tone: tone,
            footer: byUser.isEmpty ? nil : AnyView(ShareStripe(people: byUser)),
            footerHeight: size.height * 0.4
        ) {
            VStack(alignment: .leading, spacing: 4) {
                Text("You took")
                    .font(.story(30))
                    .storyRise()
                StoryCountUp(value: total, delay: 0.2)
                    .font(Theme.display(size: bigSize))
                    .tracking(-bigSize * 0.02)
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                    .storyRise(after: 0.2)
                Text("\(Format.noun(total, "photo")) together.")
                    .font(.story(30))
                    .storyRise(after: 0.4)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            if photographerCount > 1 {
                Text(splitLine)
                    .font(.system(size: 16, design: .rounded))
                    .foregroundStyle(tone.secondary)
                    .storyRise(after: 0.7)
            }
        }
    }
}

/// Everyone's share of the photos (the web's ShareStripe): a column each in their colour, as wide
/// as their share, along the bottom of the slide, with their name and count on its side in their
/// ink. The columns grow up one after another. Every column is wide enough to read; when more
/// people than fit posted, the rest share one grey "N more" column.
private struct ShareStripe: View {
    let people: [YearStats.PersonCount]

    @Environment(SessionStore.self) private var session

    private struct Column: Identifiable {
        let id: String
        let name: String
        let count: Int
        let color: MemberColor?
    }

    /// The narrowest a column gets, so the name on its side still fits.
    private static let narrowest: CGFloat = 36

    var body: some View {
        GeometryReader { geometry in
            let shown = columns(fitting: geometry.size.width)
            let widths = Self.widths(of: shown.map(\.count), in: geometry.size.width)

            HStack(spacing: 0) {
                ForEach(Array(shown.enumerated()), id: \.element.id) { index, column in
                    ShareColumn(
                        name: column.name,
                        count: column.count,
                        fill: MemberFill(column.color),
                        delay: 0.9 + Double(index) * 0.08
                    )
                    .frame(width: widths.indices.contains(index) ? widths[index] : 0)
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .leading)
        }
        .clipShape(UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(summary)
    }

    private func columns(fitting width: CGFloat) -> [Column] {
        let me = session.user?.id
        let everyone = people.filter { $0.count > 0 }.map { person in
            Column(id: person.id, name: storyName(person.user, me: me), count: person.count, color: person.color)
        }
        let room = max(2, Int(width / Self.narrowest))
        guard everyone.count > room else { return everyone }
        let kept = Array(everyone.prefix(room - 1))
        let rest = everyone.dropFirst(room - 1)
        let others = Column(
            id: "fw.others",
            name: "\(rest.count) more",
            count: rest.reduce(0) { $0 + $1.count },
            color: nil
        )
        return kept + [others]
    }

    /// Each column's width: its share of `width`, but never narrower than `narrowest` (the
    /// columns that would be get exactly that, and the others share what's left by count).
    private static func widths(of counts: [Int], in width: CGFloat) -> [CGFloat] {
        guard !counts.isEmpty else { return [] }
        // Too many to give each its minimum (only on a very narrow screen): plain shares.
        guard CGFloat(counts.count) * narrowest <= width else {
            let total = max(counts.reduce(0, +), 1)
            return counts.map { width * CGFloat($0) / CGFloat(total) }
        }
        var atMinimum = Array(repeating: false, count: counts.count)
        while true {
            let fixedCount = atMinimum.filter { $0 }.count
            let freeWidth = width - CGFloat(fixedCount) * narrowest
            var freeTotal = 0
            for index in counts.indices where !atMinimum[index] {
                freeTotal += counts[index]
            }
            var changed = false
            if freeTotal > 0 {
                for index in counts.indices where !atMinimum[index] {
                    if freeWidth * CGFloat(counts[index]) / CGFloat(freeTotal) < narrowest {
                        atMinimum[index] = true
                        changed = true
                    }
                }
            }
            if !changed {
                return counts.indices.map { index -> CGFloat in
                    if atMinimum[index] || freeTotal == 0 { return narrowest }
                    return freeWidth * CGFloat(counts[index]) / CGFloat(freeTotal)
                }
            }
        }
    }

    /// "Tomáš took 412, Nico 356 and Marek 298".
    private var summary: String {
        let me = session.user?.id
        let parts = people.enumerated().map { (index, person) -> String in
            let name = storyName(person.user, me: me)
            let count = Format.number(person.count)
            return index == 0 ? "\(name) took \(count)" : "\(name) \(count)"
        }
        return Format.list(parts)
    }
}

/// One person's column: their colour, with their name and count reading up its side near the
/// bottom. Grows up from the bottom edge (the web story's grow-up).
private struct ShareColumn: View {
    let name: String
    let count: Int
    let fill: MemberFill
    let delay: Double

    @Environment(\.fwReduceMotion) private var reduceMotion
    @State private var grown = false

    var body: some View {
        Rectangle()
            .fill(fill.background)
            .overlay(alignment: .bottom) {
                StorySidewaysLayout {
                    label
                        .rotationEffect(.degrees(-90))
                }
                .padding(.bottom, 40)
            }
            .clipped()
            .scaleEffect(x: 1, y: grown || reduceMotion ? 1 : 0.001, anchor: .bottom)
            .onAppear {
                guard !grown, !reduceMotion else { return }
                withMotion(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.9).delay(delay)) {
                    grown = true
                }
            }
    }

    private var label: some View {
        HStack(spacing: 8) {
            Text(name)
                .fontWeight(.medium)
            Text(Format.number(count))
                .fontWeight(.bold)
                .monospacedDigit()
        }
        .font(.system(size: 20, design: .rounded))
        .foregroundStyle(fill.ink)
        .lineLimit(1)
        .fixedSize()
    }
}

/// Lays its one child on its side: the child is drawn turned a quarter (by the caller's
/// `rotationEffect`), so this takes its height as width and its width as height.
private struct StorySidewaysLayout: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        guard let child = subviews.first else { return .zero }
        let size = child.sizeThatFits(.unspecified)
        return CGSize(width: size.height, height: size.width)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        guard let child = subviews.first else { return }
        let size = child.sizeThatFits(.unspecified)
        child.place(at: CGPoint(x: bounds.midX, y: bounds.midY), anchor: .center, proposal: ProposedViewSize(size))
    }
}

private struct TopPhotographerSlide: View {
    let top: YearStats.PersonCount
    let runnersUp: [YearStats.PersonCount]
    let tone: StoryTone
    let size: CGSize

    @Environment(SessionStore.self) private var session

    var body: some View {
        let me = session.user?.id

        SlideFrame(tone: tone) {
            PersonAvatar(name: top.user.displayName, imagePath: top.user.avatarUrl, color: top.color, size: .xl)
                .padding(6)
                .background(tone.ink.opacity(0.25), in: Circle())
                .storyPop(after: 0.15)
            Text("\(storyName(top.user, me: me)) took the most photos.")
                .font(.story(storyHeadlineSize(size.width)))
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
                .storyRise(after: 0.35)
            StoryCountUp(value: top.count, delay: 0.55) { "\(Format.number($0)) \(Format.noun(top.count, "photo"))" }
                .font(Theme.display(size: 28))
                .lineLimit(1)
                .minimumScaleFactor(0.6)
                .storyRise(after: 0.55)
            if !runnersUp.isEmpty {
                VStack(spacing: 8) {
                    ForEach(Array(runnersUp.enumerated()), id: \.element.id) { offset, person in
                        RunnerUpRow(rank: offset + 2, name: storyName(person.user, me: me), person: person)
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Runners-up")
                .storyRise(after: 1.0)
            }
        }
    }
}

private struct RunnerUpRow: View {
    let rank: Int
    let name: String
    let person: YearStats.PersonCount

    var body: some View {
        HStack(spacing: 12) {
            PersonAvatar(name: person.user.displayName, imagePath: person.user.avatarUrl, color: person.color, size: .md)
            Text(verbatim: "\(rank). \(name)")
                .font(.system(size: 17, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(Format.number(person.count))
                .font(.system(size: 15, weight: .semibold, design: .rounded))
                .monospacedDigit()
        }
        .padding(.leading, 6)
        .padding(.trailing, 16)
        .padding(.vertical, 6)
        .background(Color.black.opacity(0.1), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(rank). \(name), \(Format.number(person.count)) \(Format.noun(person.count, "photo"))")
    }
}

private struct BusiestMonthSlide: View {
    /// 1–12.
    let month: Int
    let count: Int
    let byMonth: [Int]
    let busiestDay: YearStats.DayCount?
    /// Who posted that month, most first.
    let byUser: [YearStats.PersonCount]
    let tone: StoryTone
    let size: CGSize

    @Environment(SessionStore.self) private var session

    var body: some View {
        let me = session.user?.id
        let posters = byUser.filter { $0.count > 0 }
        let monthName = StoryDate.monthName(month)

        SlideFrame(tone: tone) {
            Text("\(monthName) was your biggest month.")
                .font(.story(storyHeadlineSize(size.width)))
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
                .storyRise()
            MonthChart(
                byMonth: byMonth,
                month: month,
                count: count,
                people: posters,
                height: max(120, min(280, size.height * 0.3))
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(chartLabel(people: posters, me: me))
            if !posters.isEmpty {
                StoryFlowLayout(spacing: 16, lineSpacing: 8) {
                    ForEach(posters) { person in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(MemberFill(person.color).background)
                                .frame(width: 12, height: 12)
                            Text(verbatim: "\(storyName(person.user, me: me)) \(Format.number(person.count))")
                                .lineLimit(1)
                        }
                    }
                }
                .font(.system(size: 15, design: .rounded))
                .accessibilityHidden(true)
                .storyRise(after: 1.2)
            }
            VStack(alignment: .leading, spacing: 8) {
                StoryCountUp(value: count, delay: 1.4, duration: 1.0) {
                    "\(Format.number($0)) \(Format.noun(count, "photo")) in \(monthName)"
                }
                .font(.system(size: 24, weight: .semibold, design: .rounded))
                .storyRise(after: 1.4)
                if let busiestDay, busiestDay.count > 1, let day = StoryDate.dayName(busiestDay.date) {
                    Text("Your busiest day was \(day): \(Format.number(busiestDay.count)) photos.")
                        .font(.system(size: 16, design: .rounded))
                        .foregroundStyle(tone.secondary)
                        .storyRise(after: 1.7)
                }
            }
        }
    }

    private func chartLabel(people: [YearStats.PersonCount], me: String?) -> String {
        let highest = "Photos per month. \(StoryDate.monthName(month)) is highest with \(Format.number(count))"
        guard !people.isEmpty else { return highest + "." }
        let names = people.map { "\(storyName($0.user, me: me)) \(Format.number($0.count))" }
        return highest + ": " + names.joined(separator: ", ") + "."
    }
}

/// Twelve bars, January first, growing up one after another. The busiest month is split into the
/// people who posted in it, each in their colour (first at the bottom), with its count on top.
private struct MonthChart: View {
    let byMonth: [Int]
    /// The busiest month, 1–12.
    let month: Int
    let count: Int
    let people: [YearStats.PersonCount]
    let height: CGFloat

    /// Room above the bars for the busiest month's count.
    private static let labelRoom: CGFloat = 24
    private static let quietBar = Color(hex: 0x5C5C59)
    private static let quietLabel = Color(hex: 0x8A8A86)

    var body: some View {
        let most = max(byMonth.max() ?? 0, 1)
        let barArea = max(height - Self.labelRoom, 1)

        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 6) {
                ForEach(Array(byMonth.enumerated()), id: \.offset) { index, photos in
                    let isBusiest = index + 1 == month
                    let delay = 0.3 + Double(index) * 0.06
                    VStack(spacing: 6) {
                        if isBusiest {
                            Text(Format.number(count))
                                .font(.system(size: 15, weight: .bold, design: .rounded))
                                .fixedSize()
                                .storyRise(after: delay + 0.5)
                        }
                        MonthBar(
                            people: isBusiest ? people : [],
                            color: isBusiest ? Color.white : Self.quietBar,
                            delay: delay
                        )
                        .frame(height: photos == 0 ? 2 : max(barArea * 0.04, barArea * CGFloat(photos) / CGFloat(most)))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: height, alignment: .bottom)

            HStack(spacing: 6) {
                ForEach(Array(byMonth.indices), id: \.self) { index in
                    let isBusiest = index + 1 == month
                    Text(StoryDate.narrowMonthName(index + 1))
                        .font(.system(size: 13, weight: isBusiest ? Font.Weight.semibold : Font.Weight.regular, design: .rounded))
                        .foregroundStyle(isBusiest ? Color.white : Self.quietLabel)
                        .frame(maxWidth: .infinity)
                }
            }
        }
    }
}

private struct MonthBar: View {
    /// The busiest month's people; empty for a plain bar in `color`.
    let people: [YearStats.PersonCount]
    let color: Color
    let delay: Double

    @Environment(\.fwReduceMotion) private var reduceMotion
    @State private var grown = false

    private var shape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: 8,
            bottomLeadingRadius: 3,
            bottomTrailingRadius: 3,
            topTrailingRadius: 8,
            style: .continuous
        )
    }

    var body: some View {
        Group {
            if people.isEmpty {
                shape.fill(color)
            } else {
                segments.clipShape(shape)
            }
        }
        .scaleEffect(x: 1, y: grown || reduceMotion ? 1 : 0.001, anchor: .bottom)
        .onAppear {
            guard !grown, !reduceMotion else { return }
            // The web story's grow-up.
            withMotion(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.9).delay(delay)) {
                grown = true
            }
        }
    }

    private var segments: some View {
        GeometryReader { geometry in
            let total = max(people.reduce(0) { $0 + $1.count }, 1)
            let gaps = CGFloat(max(people.count - 1, 0)) * 2
            let room = max(geometry.size.height - gaps, 0)
            VStack(spacing: 2) {
                ForEach(Array(people.reversed())) { person in
                    Rectangle()
                        .fill(MemberFill(person.color).background)
                        .frame(height: room * CGFloat(person.count) / CGFloat(total))
                }
            }
            .frame(width: geometry.size.width, height: geometry.size.height, alignment: .bottom)
        }
    }
}

private struct MostReactedPhotoSlide: View {
    let photo: Photo
    let count: Int
    let groupID: String
    let tone: StoryTone
    let size: CGSize

    @Environment(SessionStore.self) private var session
    @Environment(GroupsStore.self) private var groups

    /// Where a reactor's sticker sits around the photo: against a corner or edge, then moved by
    /// `x`, `y` and a fraction of the photo's side (the web's STICKER_SPOTS).
    private struct StickerSpot {
        let alignment: Alignment
        let x: CGFloat
        let y: CGFloat
        let yFraction: CGFloat
        let rotation: Double
    }

    private static let spots: [StickerSpot] = [
        StickerSpot(alignment: .topTrailing, x: 16, y: -20, yFraction: 0, rotation: 8),
        StickerSpot(alignment: .topLeading, x: -24, y: 0, yFraction: 0.4, rotation: -9),
        StickerSpot(alignment: .bottomTrailing, x: 20, y: -48, yFraction: 0, rotation: 5),
        StickerSpot(alignment: .bottomLeading, x: 20, y: 20, yFraction: 0, rotation: -5),
        StickerSpot(alignment: .topLeading, x: 32, y: -16, yFraction: 0, rotation: -6),
        StickerSpot(alignment: .bottomTrailing, x: 24, y: 0, yFraction: -0.4, rotation: 7),
    ]

    var body: some View {
        let me = session.user?.id
        let side = min(size.width * 0.78, 288)
        let reactors = Array(photo.reactions.reactors.prefix(Self.spots.count))

        SlideFrame(tone: tone, centered: true) {
            Text("The one everyone reacted to.")
                .font(.story(storyHeadlineSize(size.width)))
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
                .storyRise()
            framedPhoto(side: side)
                .overlay {
                    stickers(reactors: reactors, side: side, me: me)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(photo.altText)
                .accessibilityValue(reactorsLabel(reactors, me: me))
                .accessibilityAddTraits(.isImage)
                .storyPop(after: 0.3)
                .padding(.vertical, 16)
            VStack(spacing: 4) {
                StoryCountUp(value: count, delay: 1.3) { "\(Format.number($0)) \(Format.noun(count, "reaction"))" }
                    .font(.system(size: 24, weight: .semibold, design: .rounded))
                Text("Posted by \(poster(me: me)) on \(Format.dayMonth(photo.createdAt))")
                    .font(.system(size: 16, design: .rounded))
            }
            .storyRise(after: 1.3)
        }
    }

    /// The photo on white card, tipped a little.
    private func framedPhoto(side: CGFloat) -> some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                PhotoImage(photo: photo, variant: .medium)
            }
            .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
            .padding(10)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 36, style: .continuous))
            .rotationEffect(.degrees(-3))
            .frame(width: side, height: side)
    }

    /// Who reacted, as stickers in their colours around the photo, popping on one after another.
    private func stickers(reactors: [Reactor], side: CGFloat, me: String?) -> some View {
        ZStack {
            ForEach(Array(reactors.enumerated()), id: \.element.userId) { index, reactor in
                let spot = Self.spots[index % Self.spots.count]
                ReactorSticker(
                    emoji: reactor.type.emoji,
                    name: name(of: reactor.userId, me: me),
                    color: groups.colorOf(reactor.userId, in: groupID)
                )
                .rotationEffect(.degrees(spot.rotation))
                .storyPop(after: 0.7 + Double(index) * 0.15)
                .offset(x: spot.x, y: spot.y + spot.yFraction * side)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: spot.alignment)
            }
        }
    }

    /// "You", or their first name; empty for someone no longer in the group (the emoji still shows).
    private func name(of userID: String, me: String?) -> String {
        if userID == me { return "You" }
        guard let member = groups.member(userID, in: groupID) else { return "" }
        return storyFirstName(member.user.displayName)
    }

    private func reactorsLabel(_ reactors: [Reactor], me: String?) -> String {
        let parts = reactors.compactMap { reactor -> String? in
            let who = name(of: reactor.userId, me: me)
            return who.isEmpty ? nil : "\(who): \(reactor.type.label)"
        }
        return Format.list(parts)
    }

    private func poster(me: String?) -> String {
        photo.uploader.id == me ? "you" : storyFirstName(photo.uploader.displayName)
    }
}

/// A reactor's sticker: their reaction and name on their colour, ringed in white.
private struct ReactorSticker: View {
    let emoji: String
    let name: String
    let color: MemberColor?

    var body: some View {
        let fill = MemberFill(color)

        HStack(spacing: 6) {
            Text(emoji)
            if !name.isEmpty {
                Text(name)
                    .lineLimit(1)
            }
        }
        .font(.system(size: 18, weight: .semibold, design: .rounded))
        .foregroundStyle(fill.ink)
        .padding(.leading, 10)
        .padding(.trailing, name.isEmpty ? 10 : 14)
        .padding(.vertical, 8)
        .background(fill.background, in: Capsule())
        .background(Color.white, in: Capsule().inset(by: -4))
        .fixedSize()
        .accessibilityHidden(true)
    }
}

private struct ReactionsSlide: View {
    let total: Int
    let comments: Int
    let topReactor: YearStats.PersonCount?
    let tone: StoryTone
    let size: CGSize

    @Environment(SessionStore.self) private var session

    var body: some View {
        let me = session.user?.id
        let bigSize = storyBigNumberSize(total, width: size.width)

        SlideFrame(tone: tone, decoration: AnyView(FloatingReactions())) {
            VStack(alignment: .leading, spacing: 4) {
                Text("You sent")
                    .font(.story(30))
                    .storyRise()
                StoryCountUp(value: total, delay: 0.2)
                    .font(Theme.display(size: bigSize))
                    .tracking(-bigSize * 0.02)
                    .lineLimit(1)
                    .minimumScaleFactor(0.4)
                    .storyRise(after: 0.2)
                Text("\(Format.noun(total, "reaction")).")
                    .font(.story(30))
                    .storyRise(after: 0.4)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            if comments > 0 {
                StoryCountUp(value: comments, delay: 1.6, duration: 0.9) {
                    "…and wrote \(Format.number($0)) \(Format.noun(comments, "comment"))."
                }
                .font(.system(size: 20, weight: .semibold, design: .rounded))
                .storyRise(after: 1.6)
            }
            if let topReactor {
                TopReactorPill(person: topReactor, name: storyName(topReactor.user, me: me))
                    .storyRise(after: 2.2)
            }
        }
    }
}

/// Who reacted the most, on a pill in their colour.
private struct TopReactorPill: View {
    let person: YearStats.PersonCount
    let name: String

    var body: some View {
        let fill = MemberFill(person.color)

        HStack(spacing: 12) {
            PersonAvatar(name: person.user.displayName, imagePath: person.user.avatarUrl, color: person.color, size: .md)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(name) reacted the most")
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .lineLimit(1)
                Text("\(Format.number(person.count)) \(Format.noun(person.count, "reaction"))")
                    .font(.system(size: 14, design: .rounded))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(fill.ink)
        .padding(.leading, 8)
        .padding(.trailing, 20)
        .padding(.vertical, 8)
        .background(fill.background, in: Capsule())
        .accessibilityElement(children: .combine)
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

    @Environment(\.fwReduceMotion) private var reduceMotion
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
    let tone: StoryTone
    let size: CGSize

    private static let tilts: [Double] = [-3, 2, -1.5, 2.5, -2, 1.5, -2.5, 3, -1]

    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 12), count: photos.count <= 4 ? 2 : 3)
    }

    var body: some View {
        SlideFrame(tone: tone, centered: true) {
            Text(verbatim: "\(String(year)) in pictures.")
                .font(.story(storyHeadlineSize(size.width)))
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
                .storyRise()
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(Array(photos.enumerated()), id: \.element.id) { index, photo in
                    CollagePhoto(photo: photo)
                        .storyPop(after: 0.35 + Double(index) * 0.14)
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
                PhotoImage(photo: photo, variant: .thumbnail)
            }
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .padding(6)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(photo.altText)
            .accessibilityAddTraits(.isImage)
    }
}

/// Your own year in the group, in your colour. Only you see it, and it holds nothing about anyone else.
private struct YouSlide: View {
    let yours: WrappedSlide.Yours
    let year: Int
    let tone: StoryTone
    let size: CGSize

    private struct Tile: Identifiable {
        let value: Int
        let label: String

        var id: String { label }
    }

    /// What there is to say: a count of nothing isn't worth a tile.
    private var tiles: [Tile] {
        var tiles: [Tile] = []
        if yours.photos > 0 {
            tiles.append(Tile(value: yours.photos, label: Format.noun(yours.photos, "photo")))
        }
        if yours.reactionsReceived > 0 {
            tiles.append(Tile(value: yours.reactionsReceived, label: "\(Format.noun(yours.reactionsReceived, "reaction")) on your photos"))
        }
        if yours.reactionsGiven > 0 {
            tiles.append(Tile(value: yours.reactionsGiven, label: "\(Format.noun(yours.reactionsGiven, "reaction")) sent"))
        }
        if yours.commentsWritten > 0 {
            tiles.append(Tile(value: yours.commentsWritten, label: "\(Format.noun(yours.commentsWritten, "comment")) written"))
        }
        return tiles
    }

    var body: some View {
        SlideFrame(tone: tone, centered: true) {
            Text(verbatim: "Your \(String(year)), just you.")
                .font(.story(storyHeadlineSize(size.width)))
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
                .storyRise()
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(Array(tiles.enumerated()), id: \.element.id) { index, tile in
                    VStack(spacing: 2) {
                        StoryCountUp(value: tile.value, delay: 0.25 + Double(index) * 0.12, duration: 1.0)
                            .font(Theme.display(size: 30))
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                        Text(tile.label)
                            .font(.system(size: 14, design: .rounded))
                            .multilineTextAlignment(.center)
                            .opacity(0.85)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                    .background(tone.ink.opacity(0.1), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .accessibilityElement(children: .combine)
                }
            }
            .storyRise(after: 0.25)
            if let best = yours.bestPhoto {
                HStack(spacing: 16) {
                    Color.clear
                        .aspectRatio(1, contentMode: .fit)
                        .overlay { PhotoImage(photo: best.photo, variant: .medium) }
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .padding(6)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                        .rotationEffect(.degrees(-3))
                        .frame(width: min(size.width * 0.34, 140))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Your most loved photo")
                            .font(.system(size: 18, weight: .semibold, design: .rounded))
                        Text("\(Format.number(best.count)) \(Format.noun(best.count, "reaction"))")
                            .font(.system(size: 16, design: .rounded))
                    }
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityElement(children: .combine)
                .storyRise(after: 0.9)
            }
            if let busiest = yours.busiestMonth {
                Text("You posted the most in \(StoryDate.monthName(busiest.month)): \(Format.number(busiest.count)) \(Format.noun(busiest.count, "photo")).")
                    .font(.system(size: 16, design: .rounded))
                    .storyRise(after: 1.2)
            }
        }
    }
}

private struct OutroSlide: View {
    let photos: Int
    let reactions: Int
    let comments: Int
    let people: Int
    let wrapped: Wrapped
    let tone: StoryTone
    let size: CGSize

    @Environment(GroupsStore.self) private var groups

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
        SlideFrame(tone: tone, centered: true, bottomInset: 120) {
            GroupBadge(
                groupID: wrapped.group.id,
                emoji: wrapped.group.emoji,
                avatarURL: groups.group(wrapped.group.id)?.avatarUrl,
                size: 88
            )
            .storyPop()
            Text("That's your year together.")
                .font(.story(storyHeadlineSize(size.width)))
                .minimumScaleFactor(0.7)
                .accessibilityAddTraits(.isHeader)
                .storyRise(after: 0.2)
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(totals) { total in
                    VStack(spacing: 2) {
                        StoryCountUp(value: total.value, delay: 0.5, duration: 1.0)
                            .font(Theme.display(size: 30))
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                        Text(total.label)
                            .font(.system(size: 14, design: .rounded))
                            .foregroundStyle(.sub)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 12)
                    .background(.surface, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .accessibilityElement(children: .combine)
                }
            }
            .storyRise(after: 0.5)
            if !wrapped.final {
                Text(verbatim: "And \(String(wrapped.year)) isn't over yet. Keep them coming.")
                    .font(.system(size: 17, weight: .semibold, design: .rounded))
                    .storyRise(after: 0.9)
            }
        }
    }
}

// MARK: - Building blocks

/// A full-screen slide: its tone's background, content clear of the progress bar at the top,
/// an optional decoration behind it and an optional full-width footer along the bottom edge
/// (the content stays clear of it).
private struct SlideFrame<Content: View>: View {
    let tone: StoryTone
    let centered: Bool
    let bottomInset: CGFloat
    let decoration: AnyView?
    let footer: AnyView?
    let footerHeight: CGFloat
    let content: Content

    init(
        tone: StoryTone,
        centered: Bool = false,
        bottomInset: CGFloat = 48,
        decoration: AnyView? = nil,
        footer: AnyView? = nil,
        footerHeight: CGFloat = 0,
        @ViewBuilder content: () -> Content
    ) {
        self.tone = tone
        self.centered = centered
        self.bottomInset = bottomInset
        self.decoration = decoration
        self.footer = footer
        self.footerHeight = footerHeight
        self.content = content()
    }

    var body: some View {
        ZStack {
            tone.background
                .ignoresSafeArea()
            if let decoration {
                decoration
            }
            VStack(alignment: centered ? .center : .leading, spacing: 20) {
                content
            }
            .multilineTextAlignment(centered ? .center : .leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: centered ? .center : .leading)
            .padding(.horizontal, 24)
            .padding(.top, 96)
            .padding(.bottom, footer == nil ? bottomInset : footerHeight + 16)
            if let footer {
                // Edge to edge, down to the very bottom of the screen (under the home indicator).
                footer
                    .frame(height: footerHeight)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    .ignoresSafeArea(edges: .bottom)
            }
        }
        .foregroundStyle(tone.ink)
    }
}

/// Text whose number counts up while the words around it stay put.
private struct StoryCountingText: View, Animatable {
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

/// Counts up from zero to `value` as it appears (the web's AnimatedNumber). VoiceOver reads the
/// final number straight away; with reduced motion, everyone sees it.
private struct StoryCountUp: View {
    let value: Int
    var delay: Double = 0
    var duration: Double = 1.4
    var format: (Int) -> String = { Format.number($0) }

    @Environment(\.fwReduceMotion) private var reduceMotion
    @State private var counted = false

    var body: some View {
        StoryCountingText(value: counted || reduceMotion ? Double(value) : 0, format: format)
            .monospacedDigit()
            .onAppear {
                guard !counted, !reduceMotion else { return }
                // Ease-out cubic, like the web story.
                withMotion(.timingCurve(0.33, 1, 0.68, 1, duration: duration).delay(delay)) {
                    counted = true
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(format(value))
    }
}

/// Lays its children out in rows, wrapping onto the next row when one is full (the busiest
/// month's legend).
private struct StoryFlowLayout: Layout {
    var spacing: CGFloat = 16
    var lineSpacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        var widest: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0, x + size.width > maxWidth {
                y += lineHeight + lineSpacing
                x = 0
                lineHeight = 0
            }
            widest = max(widest, x + size.width)
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: widest, height: y + lineHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX {
                y += lineHeight + lineSpacing
                x = bounds.minX
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}

/// "You" for the person watching, otherwise their first name (the web's useNameOf).
private func storyName(_ user: UserSummary, me: String?) -> String {
    user.id == me ? "You" : storyFirstName(user.displayName)
}

/// "Tomáš" from "Tomáš Novák".
private func storyFirstName(_ displayName: String) -> String {
    displayName.split(whereSeparator: \.isWhitespace).first.map { String($0) } ?? displayName
}

/// Headlines: 9.5% of the story's width, between 30 and 36 points.
private func storyHeadlineSize(_ width: CGFloat) -> CGFloat {
    min(36, max(30, width * 0.095))
}

/// Big numbers get as large as fits the story's width (the web's container-query sizes).
private func storyBigNumberSize(_ value: Int, width: CGFloat) -> CGFloat {
    let length = Format.number(value).count
    if length <= 3 { return min(136, max(72, width * 0.36)) }
    if length <= 5 { return min(112, max(64, width * 0.28)) }
    if length <= 7 { return min(80, max(48, width * 0.21)) }
    return min(64, max(40, width * 0.16))
}

/// Month and day names, in the viewer's language.
private enum StoryDate {
    /// The server's months and dates are Gregorian, whatever calendar the phone uses (Buddhist,
    /// Hebrew, Islamic…): month 3 is March, and "2026-06-14" is a Sunday, everywhere.
    private static let gregorian: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        return calendar
    }()

    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = gregorian
        return formatter
    }()

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
            let day = gregorian.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
        else { return nil }
        var style = Date.FormatStyle.dateTime.weekday(.wide).day().month(.wide)
        style.calendar = gregorian
        style.timeZone = gregorian.timeZone
        return day.formatted(style)
    }

    private static func name(_ month: Int, in names: [String]?) -> String {
        guard let names, names.indices.contains(month - 1) else { return "" }
        return names[month - 1]
    }
}

private extension Font {
    /// Wrapped's words: rounded and a little wide, like the web app's Fredoka at 112%.
    static func story(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .rounded).width(.expanded)
    }
}

// MARK: - Motion

extension View {
    /// Fades and slides up into place after `delay` seconds (the web story's `rise`). Still with
    /// reduced motion.
    func storyRise(after delay: Double = 0) -> some View {
        modifier(StoryRiseModifier(delay: delay))
    }

    /// Pops in from half size with a little overshoot after `delay` seconds (the web story's `pop`).
    func storyPop(after delay: Double = 0) -> some View {
        modifier(StoryPopModifier(delay: delay))
    }
}

private struct StoryRiseModifier: ViewModifier {
    let delay: Double

    @Environment(\.fwReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let visible = shown || reduceMotion
        content
            .opacity(visible ? 1 : 0)
            .offset(y: visible ? 0 : 20)
            .onAppear {
                guard !shown, !reduceMotion else { return }
                withMotion(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.7).delay(delay)) {
                    shown = true
                }
            }
    }
}

private struct StoryPopModifier: ViewModifier {
    let delay: Double

    @Environment(\.fwReduceMotion) private var reduceMotion
    @State private var shown = false

    func body(content: Content) -> some View {
        let visible = shown || reduceMotion
        content
            .opacity(visible ? 1 : 0)
            .scaleEffect(visible ? 1 : 0.5)
            .onAppear {
                guard !shown, !reduceMotion else { return }
                withMotion(.spring(duration: 0.7, bounce: 0.45).delay(delay)) {
                    shown = true
                }
            }
    }
}
