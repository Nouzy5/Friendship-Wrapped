import SwiftUI
import UIKit

// Wrapped share cards (the web app's features/wrapped/share). A card is drawn on the phone and
// leaves only through the system share sheet; nothing about it goes to the server.
//
// The rule that matters most: a photo you aren't allowed to save never goes on a card. Exporting
// a card counts as saving, so photos from people who turned off photo saving are replaced with a
// block of their colour, and their image isn't even fetched.

// MARK: - The plan

/// A fill and the ink that reads on it. Fixed colours, not the app's theme: a shared card looks
/// the same wherever it lands.
struct CardFill: Equatable {
    let background: Color
    let ink: Color

    /// Neutral for people without a colour (beyond twelve members, or who have left).
    init(_ color: MemberColor?) {
        if let color {
            background = color.fill
            ink = color.ink
        } else {
            background = Color(hex: 0xD0D0CC)
            ink = .black
        }
    }

    init(background: Color, ink: Color) {
        self.background = background
        self.ink = ink
    }
}

struct CardTone: Equatable {
    let background: Color
    let ink: Color
    let secondary: Color
    /// Panels on the card (the stat tiles).
    let panel: Color

    static let paper = CardTone(background: .white, ink: .black, secondary: Color(hex: 0x6E6E6A), panel: Color(hex: 0xF2F2F0))
    static let night = CardTone(background: .black, ink: .white, secondary: Color(hex: 0xA8A8A4), panel: Color(hex: 0x1C1C1B))

    static func person(_ color: MemberColor?) -> CardTone {
        let fill = CardFill(color)
        let dark = !(color?.inkIsWhite ?? false)
        return CardTone(
            background: fill.background,
            ink: fill.ink,
            secondary: fill.ink.opacity(dark ? 0.65 : 0.78),
            panel: fill.ink.opacity(dark ? 0.1 : 0.18)
        )
    }
}

/// A photo, or a block of its uploader's colour where it may not be saved.
enum CardSlot: Equatable {
    /// `fallback` shows if the image can't be loaded.
    case photo(path: String, fallback: CardFill)
    case block(CardFill)

    /// `Photo.canSave` is the server's answer to "may this viewer download this photo?": always
    /// for your own, and for others' only if the uploader allows it. Anything else is a block.
    static func of(_ photo: Photo, variant: Photo.Variant, colorOf: (String) -> MemberColor?) -> CardSlot {
        let fill = CardFill(colorOf(photo.uploader.id))
        // Exactly the size the card wants, whatever Data saver says: the card is made once, here.
        let path = variant == .thumbnail ? photo.imageUrls.thumbnail : photo.imageUrls.medium
        return photo.canSave ? .photo(path: path, fallback: fill) : .block(fill)
    }
}

/// A line of text on a card.
struct CardText: Equatable {
    let value: String
    let size: CGFloat
    let weight: Font.Weight
    /// Quieter ink.
    let secondary: Bool
}

enum CardBlock: Equatable {
    case heading(String)
    case text(CardText)
    case number(String)
    case polaroid(CardSlot, side: CGFloat)
    case grid([CardSlot])
    case bars(values: [Int], highlight: Int, labels: [String])
    case stripe([Segment])
    case stats([Stat])
    case pills([Pill])
    case gap(CGFloat)

    struct Segment: Equatable {
        let label: String
        let weight: Int
        let fill: CardFill
    }

    struct Stat: Equatable {
        let value: String
        let label: String
    }

    struct Pill: Equatable {
        let label: String
        let fill: CardFill
    }

    static func text(_ value: String, size: CGFloat = 52, weight: Font.Weight = .semibold, secondary: Bool = false) -> CardBlock {
        .text(CardText(value: value, size: size, weight: weight, secondary: secondary))
    }
}

/// What a card shows, decided as plain data.
struct ShareCardPlan: Equatable {
    static let width: CGFloat = 1080
    static let height: CGFloat = 1920

    let tone: CardTone
    let emoji: String
    let groupName: String
    let year: Int
    let blocks: [CardBlock]
    let filename: String
    /// What the card says, for the share sheet.
    let title: String

    /// Every image the card loads. A colour block has none, so a photo that can't be saved is never fetched.
    var imagePaths: [String] {
        var paths: [String] = []
        func add(_ slot: CardSlot) {
            if case .photo(let path, _) = slot, !paths.contains(path) { paths.append(path) }
        }
        for block in blocks {
            switch block {
            case .polaroid(let slot, _): add(slot)
            case .grid(let slots): slots.forEach(add)
            default: break
            }
        }
        return paths
    }

    /// The card for a slide, or nil for one that isn't worth sharing (the intro).
    static func make(
        for slide: WrappedSlide,
        wrapped: Wrapped,
        meID: String,
        meName: String,
        colorOf: (String) -> MemberColor?
    ) -> ShareCardPlan? {
        let year = wrapped.year
        func plan(_ tone: CardTone, _ blocks: [CardBlock], _ name: String, _ what: String) -> ShareCardPlan {
            ShareCardPlan(
                tone: tone,
                emoji: wrapped.group.emoji,
                groupName: wrapped.group.name,
                year: year,
                blocks: blocks,
                filename: "friendship-wrapped-\(year)-\(name).png",
                title: "\(wrapped.group.name) \(year) Wrapped: \(what)"
            )
        }
        /// On a card everyone is named: "You" means nothing to the friend it is shared with.
        func name(_ someone: WrappedSlide.PersonCount) -> String { cardFirstName(someone.user.displayName) }
        func people(_ counts: [WrappedSlide.PersonCount]) -> [CardBlock.Pill] {
            counts.map { CardBlock.Pill(label: "\(name($0)) \(Format.number($0.count))", fill: CardFill($0.color)) }
        }

        switch slide {
        case .intro, .unknown:
            return nil

        case .photos(let total, _, let byUser):
            var blocks: [CardBlock] = [
                .text("We took", size: 72),
                .number(Format.number(total)),
                .text("\(Format.noun(total, "photo")) together.", size: 72),
            ]
            if byUser.count > 1 {
                blocks.append(.gap(24))
                blocks.append(.stripe(byUser.map {
                    CardBlock.Segment(label: "\(name($0)) \(Format.number($0.count))", weight: $0.count, fill: CardFill($0.color))
                }))
            }
            return plan(.paper, blocks, "photos", "\(Format.number(total)) \(Format.noun(total, "photo"))")

        case .topPhotographer(let top, let runnersUp):
            var blocks: [CardBlock] = [
                .heading("\(name(top)) took the most photos."),
                .text("\(Format.number(top.count)) \(Format.noun(top.count, "photo"))", size: 88, weight: .bold),
            ]
            if !runnersUp.isEmpty {
                let tone = CardTone.person(top.color)
                blocks.append(.pills(runnersUp.enumerated().map { index, someone in
                    CardBlock.Pill(
                        label: "\(index + 2). \(name(someone)) \(Format.number(someone.count))",
                        fill: CardFill(background: tone.ink.opacity(0.12), ink: tone.ink)
                    )
                }))
            }
            return plan(.person(top.color), blocks, "top-photographer", "top photographer")

        case .busiestMonth(let month, _, let byMonth, let busiestDay, let byUser):
            var blocks: [CardBlock] = [
                .heading("\(cardMonthName(month)) was our biggest month."),
                .bars(values: byMonth, highlight: month - 1, labels: (1...12).map { cardNarrowMonthName($0) }),
            ]
            let who = byUser.filter { $0.count > 0 }
            if !who.isEmpty { blocks.append(.pills(people(who))) }
            if let busiestDay, busiestDay.count > 1, let day = cardDayName(busiestDay.date) {
                blocks.append(.text("Our busiest day was \(day): \(Format.number(busiestDay.count)) photos.", size: 40, weight: .regular, secondary: true))
            }
            return plan(.night, blocks, "busiest-month", "\(cardMonthName(month)) was our biggest month")

        case .mostReactedPhoto(let photo, let count):
            return plan(
                .person(colorOf(photo.uploader.id)),
                [
                    .heading("The one everyone reacted to."),
                    .polaroid(CardSlot.of(photo, variant: .medium, colorOf: colorOf), side: 740),
                    .text("\(Format.number(count)) \(Format.noun(count, "reaction"))", size: 72, weight: .bold),
                    .text("Posted by \(cardFirstName(photo.uploader.displayName)) on \(Format.dayMonth(photo.createdAt))", size: 44, weight: .regular),
                ],
                "most-reacted-photo",
                "the photo everyone reacted to"
            )

        case .reactions(let total, let comments, let topReactor):
            var blocks: [CardBlock] = [
                .text("We sent", size: 72),
                .number(Format.number(total)),
                .text("\(Format.noun(total, "reaction")).", size: 72),
            ]
            if comments > 0 {
                blocks.append(.text("…and wrote \(Format.number(comments)) \(Format.noun(comments, "comment")).", size: 56))
            }
            if let topReactor {
                blocks.append(.pills([
                    CardBlock.Pill(label: "\(name(topReactor)) reacted the most · \(Format.number(topReactor.count))", fill: CardFill(topReactor.color)),
                ]))
            }
            return plan(.paper, blocks, "reactions", "\(Format.number(total)) \(Format.noun(total, "reaction"))")

        case .collage(let photos):
            return plan(
                .night,
                [
                    .heading("\(String(year)) in pictures."),
                    .grid(photos.map { CardSlot.of($0, variant: .thumbnail, colorOf: colorOf) }),
                ],
                "in-pictures",
                "in pictures"
            )

        case .you(let yours):
            var blocks: [CardBlock] = [
                .heading("\(cardFirstName(meName))’s \(String(year))"),
                .stats([
                    CardBlock.Stat(value: Format.number(yours.photos), label: Format.noun(yours.photos, "photo")),
                    CardBlock.Stat(value: Format.number(yours.reactionsReceived), label: "\(Format.noun(yours.reactionsReceived, "reaction")) got"),
                    CardBlock.Stat(value: Format.number(yours.reactionsGiven), label: "\(Format.noun(yours.reactionsGiven, "reaction")) sent"),
                    CardBlock.Stat(value: Format.number(yours.commentsWritten), label: "\(Format.noun(yours.commentsWritten, "comment")) written"),
                ]),
            ]
            if let best = yours.bestPhoto {
                blocks.append(.polaroid(CardSlot.of(best.photo, variant: .medium, colorOf: colorOf), side: 520))
                blocks.append(.text("My most loved: \(Format.number(best.count)) \(Format.noun(best.count, "reaction"))", size: 48))
            }
            if let busiest = yours.busiestMonth {
                blocks.append(.text("I posted the most in \(cardMonthName(busiest.month)).", size: 44, weight: .regular))
            }
            return plan(.person(colorOf(meID)), blocks, "my-year", "\(cardFirstName(meName))’s year")

        case .outro(let photos, let reactions, let comments, let people):
            var blocks: [CardBlock] = [
                .heading("That’s our year together."),
                .stats([
                    CardBlock.Stat(value: Format.number(photos), label: Format.noun(photos, "photo")),
                    CardBlock.Stat(value: Format.number(reactions), label: Format.noun(reactions, "reaction")),
                    CardBlock.Stat(value: Format.number(comments), label: Format.noun(comments, "comment")),
                    CardBlock.Stat(value: Format.number(people), label: Format.noun(people, "friend")),
                ]),
            ]
            if !wrapped.final {
                blocks.append(.text("And \(String(year)) isn’t over yet.", size: 48))
            }
            return plan(.paper, blocks, "together", "our year together")
        }
    }
}

// Month and day names in the viewer's language. The server's months and dates are Gregorian
// whatever calendar the phone uses: month 3 is March, and "2026-06-14" is a Sunday, everywhere.

private let cardCalendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
    calendar.locale = .current
    return calendar
}()

private func cardMonthName(_ month: Int) -> String {
    let names = cardCalendar.standaloneMonthSymbols
    return names.indices.contains(month - 1) ? names[month - 1] : ""
}

private func cardNarrowMonthName(_ month: Int) -> String {
    let names = cardCalendar.veryShortStandaloneMonthSymbols
    return names.indices.contains(month - 1) ? names[month - 1] : ""
}

private func cardDayName(_ isoDate: String) -> String? {
    let parser = DateFormatter()
    parser.calendar = cardCalendar
    parser.timeZone = cardCalendar.timeZone
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.dateFormat = "yyyy-MM-dd"
    guard let date = parser.date(from: isoDate) else { return nil }
    let writer = DateFormatter()
    writer.calendar = cardCalendar
    writer.timeZone = cardCalendar.timeZone
    writer.locale = .current
    writer.setLocalizedDateFormatFromTemplate("EEEEdMMMM")
    return writer.string(from: date)
}

/// "Tomáš" from "Tomáš Novák".
private func cardFirstName(_ displayName: String) -> String {
    displayName.split(whereSeparator: \.isWhitespace).first.map { String($0) } ?? displayName
}

// MARK: - The card

/// The card at 1080 × 1920 points: a header, the slide's blocks centred between, and a footer.
/// A card with more than fits is drawn smaller, rather than cut off.
struct ShareCardView: View {
    let plan: ShareCardPlan
    /// The photos the plan asked for, by path. A photo that didn't load shows its person's colour.
    let images: [String: UIImage]

    private static let contentWidth: CGFloat = 936

    var body: some View {
        VStack(spacing: 0) {
            header
                .padding(.top, 92)
            // The first size that fits.
            ViewThatFits(in: .vertical) {
                content(scale: 1)
                content(scale: 0.88)
                content(scale: 0.76)
                content(scale: 0.64)
                content(scale: 0.52)
            }
            .frame(maxHeight: .infinity)
            footer
                .padding(.bottom, 92)
        }
        .padding(.horizontal, 72)
        .frame(width: ShareCardPlan.width, height: ShareCardPlan.height)
        .background(plan.tone.background)
        .foregroundStyle(plan.tone.ink)
        .environment(\.colorScheme, .light)
    }

    private func content(scale: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 44 * scale) {
            ForEach(Array(plan.blocks.enumerated()), id: \.offset) { _, block in
                CardBlockView(block: block, scale: scale, tone: plan.tone, images: images)
            }
        }
        .frame(width: Self.contentWidth, alignment: .leading)
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 24) {
            Text(verbatim: "\(plan.emoji) \(plan.groupName)")
                .font(.system(size: 52, weight: .semibold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(verbatim: String(plan.year))
                .font(.system(size: 52, weight: .bold, design: .rounded))
        }
    }

    /// The colour-stripe mark and the name, along the bottom of every card.
    private var footer: some View {
        HStack(spacing: 28) {
            HStack(spacing: 6) {
                ForEach(MemberColor.allCases) { color in
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .fill(color.fill)
                        .frame(width: 22, height: 22)
                }
            }
            Text("Friendship Wrapped")
                .font(.system(size: 40, weight: .semibold, design: .rounded))
        }
    }
}

private struct CardBlockView: View {
    let block: CardBlock
    let scale: CGFloat
    let tone: CardTone
    let images: [String: UIImage]

    private var width: CGFloat { 936 }

    var body: some View {
        switch block {
        case .gap(let size):
            Color.clear.frame(height: size * scale)

        case .heading(let text):
            Text(text)
                .font(.system(size: 88 * scale, weight: .bold, design: .rounded))
                .lineSpacing(2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)

        case .text(let line):
            Text(line.value)
                .font(.system(size: line.size * scale, weight: line.weight, design: .rounded))
                .foregroundStyle(line.secondary ? tone.secondary : tone.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)

        case .number(let text):
            // As big as fits the card's width.
            let size: CGFloat = text.count <= 3 ? 400 : text.count <= 5 ? 320 : text.count <= 7 ? 230 : 170
            Text(text)
                .font(.system(size: size * scale, weight: .bold, design: .rounded))
                .lineLimit(1)
                .minimumScaleFactor(0.3)
                .frame(maxWidth: .infinity, alignment: .leading)

        case .polaroid(let slot, let side):
            CardPrint(slot: slot, images: images, side: side * scale, frame: 22, tilt: -3)
                .frame(maxWidth: .infinity)

        case .grid(let slots):
            grid(slots)

        case .bars(let values, let highlight, let labels):
            bars(values: values, highlight: highlight, labels: labels)

        case .stripe(let segments):
            stripe(segments)

        case .stats(let stats):
            statTiles(stats)

        case .pills(let pills):
            CardFlowLayout(spacing: 20, lineSpacing: 20) {
                ForEach(Array(pills.enumerated()), id: \.offset) { _, pill in
                    Text(pill.label)
                        .font(.system(size: 42 * scale, weight: .semibold, design: .rounded))
                        .lineLimit(1)
                        .foregroundStyle(pill.fill.ink)
                        .padding(.horizontal, 36)
                        .frame(height: 88 * scale)
                        .background(pill.fill.background, in: Capsule())
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // Prints on a table: two columns for up to four photos, otherwise three, each tipped a little.
    private static let tilts: [Double] = [-3, 2, -1.5, 2.5, -2, 1.5, -2.5, 3, -1]

    private func grid(_ slots: [CardSlot]) -> some View {
        let columns = slots.count <= 4 ? 2 : 3
        let gap: CGFloat = 30 * scale
        let cell = floor((width * scale - gap * CGFloat(columns - 1)) / CGFloat(columns))
        let rows = stride(from: 0, to: slots.count, by: columns).map { start in
            Array(slots.enumerated()).filter { $0.offset >= start && $0.offset < start + columns }
        }
        return VStack(spacing: gap) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: gap) {
                    ForEach(row, id: \.offset) { item in
                        CardPrint(
                            slot: item.element,
                            images: images,
                            side: cell - 28,
                            frame: 10,
                            tilt: Self.tilts[item.offset % Self.tilts.count]
                        )
                        .frame(width: cell, height: cell)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }

    private func bars(values: [Int], highlight: Int, labels: [String]) -> some View {
        let most = CGFloat(max(values.max() ?? 1, 1))
        let room = (560 - 56 - 64) * scale
        return HStack(alignment: .bottom, spacing: 14 * scale) {
            ForEach(Array(values.enumerated()), id: \.offset) { index, value in
                let highlighted = index == highlight
                VStack(spacing: 10 * scale) {
                    if highlighted {
                        Text("\(value)")
                            .font(.system(size: 44 * scale, weight: .bold, design: .rounded))
                            .lineLimit(1)
                            .minimumScaleFactor(0.5)
                    }
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(highlighted ? tone.ink : Color(hex: 0x5C5C59))
                        .frame(height: value == 0 ? 4 : max(10, CGFloat(value) / most * room))
                    Text(labels.indices.contains(index) ? labels[index] : "")
                        .font(.system(size: 34 * scale, weight: highlighted ? .bold : .regular, design: .rounded))
                        .foregroundStyle(highlighted ? tone.ink : tone.secondary)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .frame(height: 560 * scale, alignment: .bottom)
    }

    private func stripe(_ segments: [CardBlock.Segment]) -> some View {
        let total = CGFloat(max(segments.reduce(0) { $0 + $1.weight }, 1))
        let height = 220 * scale
        return HStack(spacing: 0) {
            ForEach(Array(segments.enumerated()), id: \.offset) { _, segment in
                let segmentWidth = width * CGFloat(segment.weight) / total
                segment.fill.background
                    .frame(width: segmentWidth, height: height)
                    .overlay {
                        // The name runs up the column when the column is wide enough to hold it.
                        if segmentWidth >= 70 {
                            Text(segment.label)
                                .font(.system(size: 38 * scale, weight: .semibold, design: .rounded))
                                .foregroundStyle(segment.fill.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.5)
                                .frame(width: height - 48 * scale)
                                .rotationEffect(.degrees(-90))
                        }
                    }
            }
        }
        .frame(width: width, height: height)
        .clipShape(RoundedRectangle(cornerRadius: 48, style: .continuous))
    }

    private func statTiles(_ stats: [CardBlock.Stat]) -> some View {
        let rows = stride(from: 0, to: stats.count, by: 2).map { Array(stats[$0..<min($0 + 2, stats.count)]) }
        return VStack(spacing: 28 * scale) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                HStack(spacing: 28 * scale) {
                    ForEach(Array(row.enumerated()), id: \.offset) { _, stat in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(stat.value)
                                .font(.system(size: 112 * scale, weight: .bold, design: .rounded))
                                .lineLimit(1)
                                .minimumScaleFactor(0.4)
                            Text(stat.label)
                                .font(.system(size: 40 * scale, design: .rounded))
                                .foregroundStyle(tone.secondary)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                        }
                        .padding(.horizontal, 40)
                        .frame(maxWidth: .infinity, minHeight: 230 * scale, alignment: .leading)
                        .background(tone.panel, in: RoundedRectangle(cornerRadius: 56, style: .continuous))
                    }
                }
            }
        }
        .frame(maxWidth: .infinity)
    }
}

/// A photo (or its block of colour) in a white frame, tipped a little.
private struct CardPrint: View {
    let slot: CardSlot
    let images: [String: UIImage]
    let side: CGFloat
    let frame: CGFloat
    let tilt: Double

    var body: some View {
        content
            .frame(width: side, height: side)
            .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
            .padding(frame)
            .background(Color.white, in: RoundedRectangle(cornerRadius: 44, style: .continuous))
            .rotationEffect(.degrees(tilt))
    }

    @ViewBuilder private var content: some View {
        switch slot {
        case .photo(let path, let fallback):
            if let image = images[path] {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
            } else {
                fallback.background
            }
        case .block(let fill):
            fill.background
        }
    }
}

/// Lays its children out in rows, wrapping onto the next row when one is full.
private struct CardFlowLayout: Layout {
    var spacing: CGFloat
    var lineSpacing: CGFloat

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

// MARK: - Making and sharing it

enum ShareCardRenderer {
    /// Draws the card on this phone: loads only the photos the plan asks for, then renders it.
    @MainActor
    static func render(_ plan: ShareCardPlan) async -> UIImage? {
        var images: [String: UIImage] = [:]
        for path in plan.imagePaths {
            if let image = await ImageLoader.load(path) { images[path] = image }
        }
        let renderer = ImageRenderer(content: ShareCardView(plan: plan, images: images))
        renderer.scale = 1
        renderer.isOpaque = true
        return renderer.uiImage
    }
}

/// A finished card, as a PNG file in the temporary folder, on its way to the share sheet.
struct SharedCardFile: Identifiable {
    let id = UUID()
    let url: URL
}

/// The system share sheet, for one file. The file is deleted once the sheet is done with it.
struct CardShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, _ in
            try? FileManager.default.removeItem(at: url)
        }
        return controller
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
