/** What one email says. `renderEmail` turns it into the plain-text and HTML versions. */
export type EmailContent = {
  /** The grey preview line some inboxes show after the subject. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  /** One call to action, shown as a button (and as a plain link in the text version). */
  button?: { label: string; url: string };
  /** Small print under the button. */
  footnote?: string;
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** The same look as the app: black on white, rounded, one button. Inline styles only: email clients drop the rest. */
export function renderEmail({ preheader, heading, paragraphs, button, footnote }: EmailContent): { text: string; html: string } {
  const text = [
    heading,
    "",
    ...paragraphs.flatMap((paragraph) => [paragraph, ""]),
    ...(button ? [`${button.label}:`, button.url, ""] : []),
    ...(footnote ? [footnote, ""] : []),
    "— Friendship Wrapped",
  ].join("\n");

  const body = paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#000000;">${escapeHtml(paragraph)}</p>`)
    .join("");
  const cta = button
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#000000;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:999px;">${escapeHtml(button.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#6e6e6a;">Button not working? Paste this link into your browser:<br><a href="${escapeHtml(button.url)}" style="color:#6e6e6a;word-break:break-all;">${escapeHtml(button.url)}</a></p>`
    : "";
  const small = footnote ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#6e6e6a;">${escapeHtml(footnote)}</p>` : "";

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f2f2f0;font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f0;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:24px;"><tr><td style="padding:32px 28px;">
<p style="margin:0 0 20px;font-size:14px;font-weight:700;letter-spacing:0.02em;color:#000000;">Friendship Wrapped</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#000000;">${escapeHtml(heading)}</h1>
${body}${cta}${small}
</td></tr></table>
</td></tr></table>
</body>
</html>`;

  return { text, html };
}
