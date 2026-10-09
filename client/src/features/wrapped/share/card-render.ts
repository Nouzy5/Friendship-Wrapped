import { MEMBER_COLORS, MEMBER_PALETTE } from "../../../lib/member-colors";
import { CARD_HEIGHT, CARD_WIDTH, planImageUrls, type Block, type CardPlan, type Fill, type PhotoSlot } from "./card-plan";

/*
 * Draws a CardPlan on a canvas, on the device. Nothing here talks to the server except
 * fetching the photos the plan asks for (same origin, with the session cookie, like any photo
 * in the app); the finished PNG goes only where the person sends it from the share sheet.
 */

const FONT = '"Fredoka Variable", ui-rounded, "SF Pro Rounded", system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"';
const PAD = 72;
const CONTENT_WIDTH = CARD_WIDTH - PAD * 2;
const BODY_TOP = 220;
const BODY_BOTTOM = CARD_HEIGHT - 220;
const BLOCK_GAP = 44;
/** Slight tilts, so a grid of photos looks like prints on a table. */
const TILTS = [-3, 2, -1.5, 2.5, -2, 1.5, -2.5, 3, -1];

type Ctx = CanvasRenderingContext2D;
type Images = Map<string, CanvasImageSource | null>;

/** Loads a photo as an image, or null if it can't be (the card then shows the person's colour instead). */
export type ImageLoader = (url: string) => Promise<CanvasImageSource | null>;

export async function fetchImage(url: string): Promise<CanvasImageSource | null> {
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) return null;
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

/** The card's rounded font has to be ready before drawing with it, or the canvas falls back to a plain one. */
async function loadFonts(): Promise<void> {
  try {
    await Promise.all([400, 600, 700].map((weight) => document.fonts.load(`${weight} 48px "Fredoka Variable"`)));
  } catch {
    // Draws in the fallback font instead.
  }
}

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT}`;

function roundedRect(ctx: Ctx, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/** Breaks text into lines no wider than `maxWidth`, at spaces (or anywhere, for a word that is too long). */
function wrap(ctx: Ctx, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  const push = () => {
    if (line) lines.push(line);
    line = "";
  };
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }
    push();
    if (ctx.measureText(word).width <= maxWidth) {
      line = word;
      continue;
    }
    for (const character of word) {
      if (line && ctx.measureText(line + character).width > maxWidth) push();
      line += character;
    }
  }
  push();
  return lines;
}

/** Draws an image to fill the box, cropping what spills over. */
function drawCover(ctx: Ctx, image: CanvasImageSource, x: number, y: number, width: number, height: number) {
  const source = image as unknown as { width: number; height: number };
  const scale = Math.max(width / source.width, height / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

/** A photo in a rounded box, or a block of colour where the photo may not be saved (or didn't load). */
function drawSlot(ctx: Ctx, slot: PhotoSlot, images: Images, x: number, y: number, size: number, radius: number) {
  ctx.save();
  roundedRect(ctx, x, y, size, size, radius);
  ctx.clip();
  const image = slot.kind === "photo" ? images.get(slot.url) : null;
  if (slot.kind === "photo" && image) {
    drawCover(ctx, image, x, y, size, size);
  } else {
    const fill: Fill = slot.kind === "photo" ? slot.fallback : slot.fill;
    ctx.fillStyle = fill.background;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function drawPrint(ctx: Ctx, slot: PhotoSlot, images: Images, centerX: number, centerY: number, size: number, tilt: number, frame: number) {
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((tilt * Math.PI) / 180);
  ctx.fillStyle = "#ffffff";
  roundedRect(ctx, -size / 2 - frame, -size / 2 - frame, size + frame * 2, size + frame * 2, 44);
  ctx.fill();
  drawSlot(ctx, slot, images, -size / 2, -size / 2, size, 32);
  ctx.restore();
}

type Placed = { height: number; draw: (y: number) => void };

function place(ctx: Ctx, block: Block, plan: CardPlan, images: Images): Placed {
  const { tone } = plan;
  ctx.textBaseline = "alphabetic";

  switch (block.kind) {
    case "gap":
      return { height: block.size, draw: () => {} };

    case "heading": {
      ctx.font = font(700, 88);
      const lines = wrap(ctx, block.text, CONTENT_WIDTH);
      const lineHeight = 98;
      return {
        height: lines.length * lineHeight,
        draw: (y) => {
          ctx.font = font(700, 88);
          ctx.fillStyle = tone.ink;
          ctx.textAlign = "left";
          lines.forEach((line, index) => ctx.fillText(line, PAD, y + index * lineHeight + 80));
        },
      };
    }

    case "text": {
      const size = block.size ?? 52;
      const weight = block.weight ?? 600;
      ctx.font = font(weight, size);
      const lines = wrap(ctx, block.text, CONTENT_WIDTH);
      const lineHeight = Math.round(size * 1.28);
      return {
        height: lines.length * lineHeight,
        draw: (y) => {
          ctx.font = font(weight, size);
          ctx.fillStyle = block.sub ? tone.sub : tone.ink;
          ctx.textAlign = "left";
          lines.forEach((line, index) => ctx.fillText(line, PAD, y + index * lineHeight + size));
        },
      };
    }

    case "number": {
      // As big as fits the card's width.
      let size = block.text.length <= 3 ? 400 : block.text.length <= 5 ? 320 : block.text.length <= 7 ? 230 : 170;
      ctx.font = font(700, size);
      while (size > 80 && ctx.measureText(block.text).width > CONTENT_WIDTH) {
        size -= 10;
        ctx.font = font(700, size);
      }
      return {
        height: Math.round(size * 0.95),
        draw: (y) => {
          ctx.font = font(700, size);
          ctx.fillStyle = tone.ink;
          ctx.textAlign = "left";
          ctx.fillText(block.text, PAD - size * 0.03, y + size * 0.82);
        },
      };
    }

    case "polaroid": {
      const size = block.size ?? Math.round(CONTENT_WIDTH * 0.74);
      const frame = 22;
      const height = size + frame * 2 + 36;
      return { height, draw: (y) => drawPrint(ctx, block.slot, images, CARD_WIDTH / 2, y + height / 2, size, -3, frame) };
    }

    case "grid": {
      const columns = block.slots.length <= 4 ? 2 : 3;
      const gap = 30;
      const cell = Math.floor((CONTENT_WIDTH - gap * (columns - 1)) / columns);
      const rows = Math.ceil(block.slots.length / columns);
      const height = rows * cell + (rows - 1) * gap;
      return {
        height,
        draw: (y) => {
          block.slots.forEach((slot, index) => {
            const column = index % columns;
            const row = Math.floor(index / columns);
            const frame = 10;
            const photo = cell - frame * 2 - 8;
            const centerX = PAD + column * (cell + gap) + cell / 2;
            const centerY = y + row * (cell + gap) + cell / 2;
            drawPrint(ctx, slot, images, centerX, centerY, photo, TILTS[index % TILTS.length]!, frame);
          });
        },
      };
    }

    case "bars": {
      const height = 560;
      const gap = 14;
      const barWidth = (CONTENT_WIDTH - gap * 11) / 12;
      const most = Math.max(...block.values, 1);
      return {
        height,
        draw: (y) => {
          const floor = y + height - 56;
          const room = height - 56 - 64;
          block.values.forEach((value, index) => {
            const x = PAD + index * (barWidth + gap);
            const barHeight = value === 0 ? 4 : Math.max(10, (value / most) * room);
            const highlighted = index === block.highlight;
            ctx.fillStyle = highlighted ? tone.ink : "#5c5c59";
            roundedRect(ctx, x, floor - barHeight, barWidth, barHeight, 12);
            ctx.fill();
            ctx.textAlign = "center";
            ctx.fillStyle = highlighted ? tone.ink : tone.sub;
            ctx.font = font(highlighted ? 700 : 400, 34);
            ctx.fillText(block.labels[index] ?? "", x + barWidth / 2, floor + 46);
            if (highlighted) {
              ctx.font = font(700, 44);
              ctx.fillStyle = tone.ink;
              ctx.fillText(String(value), x + barWidth / 2, floor - barHeight - 18);
            }
          });
        },
      };
    }

    case "stripe": {
      const height = 220;
      const total = block.segments.reduce((sum, segment) => sum + segment.weight, 0) || 1;
      return {
        height,
        draw: (y) => {
          ctx.save();
          roundedRect(ctx, PAD, y, CONTENT_WIDTH, height, 48);
          ctx.clip();
          let x = PAD;
          for (const segment of block.segments) {
            const width = (segment.weight / total) * CONTENT_WIDTH;
            ctx.fillStyle = segment.fill.background;
            ctx.fillRect(x, y, width + 1, height);
            // The name runs up the column, as in the story, when the column is wide enough to hold it.
            if (width >= 70) {
              ctx.save();
              ctx.translate(x + width / 2, y + height - 24);
              ctx.rotate(-Math.PI / 2);
              ctx.font = font(600, 38);
              let label = segment.label;
              while (label.length > 1 && ctx.measureText(label).width > height - 48) label = `${label.slice(0, -2)}…`;
              ctx.fillStyle = segment.fill.ink;
              ctx.textAlign = "left";
              ctx.fillText(label, 0, 13);
              ctx.restore();
            }
            x += width;
          }
          ctx.restore();
        },
      };
    }

    case "stats": {
      const gap = 28;
      const cardWidth = (CONTENT_WIDTH - gap) / 2;
      const cardHeight = 230;
      const rows = Math.ceil(block.items.length / 2);
      return {
        height: rows * cardHeight + (rows - 1) * gap,
        draw: (y) => {
          block.items.forEach((item, index) => {
            const x = PAD + (index % 2) * (cardWidth + gap);
            const top = y + Math.floor(index / 2) * (cardHeight + gap);
            ctx.fillStyle = tone.panel;
            roundedRect(ctx, x, top, cardWidth, cardHeight, 56);
            ctx.fill();
            ctx.textAlign = "left";
            ctx.fillStyle = tone.ink;
            ctx.font = font(700, 112);
            ctx.fillText(item.value, x + 40, top + 128);
            ctx.fillStyle = tone.sub;
            ctx.font = font(400, 40);
            ctx.fillText(item.label, x + 42, top + 190);
          });
        },
      };
    }

    case "pills": {
      const pillHeight = 88;
      const gap = 20;
      ctx.font = font(600, 42);
      const widths = block.items.map((item) => Math.min(CONTENT_WIDTH, ctx.measureText(item.label).width + 72));
      // Flow onto as many rows as it takes.
      const rows: number[][] = [[]];
      let used = 0;
      widths.forEach((width, index) => {
        if (used > 0 && used + gap + width > CONTENT_WIDTH) {
          rows.push([]);
          used = 0;
        }
        rows.at(-1)!.push(index);
        used += (used > 0 ? gap : 0) + width;
      });
      return {
        height: rows.length * pillHeight + (rows.length - 1) * gap,
        draw: (y) => {
          rows.forEach((row, rowIndex) => {
            let x = PAD;
            for (const index of row) {
              const item = block.items[index]!;
              const width = widths[index]!;
              const top = y + rowIndex * (pillHeight + gap);
              ctx.fillStyle = item.fill.background;
              roundedRect(ctx, x, top, width, pillHeight, pillHeight / 2);
              ctx.fill();
              ctx.fillStyle = item.fill.ink;
              ctx.font = font(600, 42);
              ctx.textAlign = "left";
              let label = item.label;
              while (label.length > 1 && ctx.measureText(label).width > width - 72) label = `${label.slice(0, -2)}…`;
              ctx.fillText(label, x + 36, top + 58);
              x += width + gap;
            }
          });
        },
      };
    }
  }
}

/** The colour-stripe mark and the name, along the bottom of every card. */
function drawFooter(ctx: Ctx, plan: CardPlan) {
  const cell = 22;
  const gap = 6;
  const markWidth = MEMBER_COLORS.length * cell + (MEMBER_COLORS.length - 1) * gap;
  ctx.font = font(600, 40);
  const name = "Friendship Wrapped";
  const nameWidth = ctx.measureText(name).width;
  const total = markWidth + 28 + nameWidth;
  let x = (CARD_WIDTH - total) / 2;
  const y = CARD_HEIGHT - 120;

  MEMBER_COLORS.forEach((color) => {
    ctx.fillStyle = MEMBER_PALETTE[color].hex;
    roundedRect(ctx, x, y - cell + 6, cell, cell, 7);
    ctx.fill();
    x += cell + gap;
  });
  ctx.fillStyle = plan.tone.ink;
  ctx.textAlign = "left";
  ctx.fillText(name, x + 22, y + 6);
}

function drawHeader(ctx: Ctx, plan: CardPlan) {
  const { emoji, title, year } = plan.header;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = plan.tone.ink;
  ctx.textAlign = "right";
  ctx.font = font(700, 52);
  ctx.fillText(String(year), CARD_WIDTH - PAD, 150);
  const yearWidth = ctx.measureText(String(year)).width;

  ctx.textAlign = "left";
  ctx.font = font(600, 52);
  let label = `${emoji} ${title}`;
  const room = CONTENT_WIDTH - yearWidth - 40;
  while (label.length > 2 && ctx.measureText(label).width > room) label = `${label.slice(0, -2)}…`;
  ctx.fillText(label, PAD, 150);
}

/** Paints the whole card onto a context that is CARD_WIDTH × CARD_HEIGHT. */
export function paintCard(ctx: Ctx, plan: CardPlan, images: Images): void {
  ctx.fillStyle = plan.tone.background;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  drawHeader(ctx, plan);

  const placed = plan.blocks.map((block) => place(ctx, block, plan, images));
  const natural = placed.reduce((sum, item) => sum + item.height, 0) + BLOCK_GAP * Math.max(0, placed.length - 1);
  const room = BODY_BOTTOM - BODY_TOP;
  // A card with more than fits is shrunk to fit, rather than cut off.
  const scale = Math.min(1, room / natural);
  const top = BODY_TOP + (room - natural * scale) / 2;

  ctx.save();
  ctx.translate((CARD_WIDTH * (1 - scale)) / 2, top);
  ctx.scale(scale, scale);
  let y = 0;
  for (const item of placed) {
    item.draw(y);
    y += item.height + BLOCK_GAP;
  }
  ctx.restore();

  drawFooter(ctx, plan);
}

/** Renders the plan to a PNG, on this device. */
export async function renderCard(plan: CardPlan, loadImage: ImageLoader = fetchImage): Promise<Blob> {
  await loadFonts();
  const urls = planImageUrls(plan);
  const images: Images = new Map(await Promise.all(urls.map(async (url) => [url, await loadImage(url)] as const)));

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the card");
  paintCard(ctx, plan, images);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("The card couldn't be made"))), "image/png"),
  );
}
