/**
 * Hands a finished card to the system share sheet. The card never goes through the server: it
 * is a file made on this device, and where it goes is up to the person, from the sheet.
 */
export type ShareResult = "shared" | "saved" | "cancelled";

/**
 * Opens the share sheet with the card. Browsers with no share sheet for files (most desktop ones)
 * can't do that, so there the card is saved to the person's downloads instead; they asked for it.
 */
export async function shareCard(image: Blob, filename: string, title: string): Promise<ShareResult> {
  const file = new File([image], filename, { type: "image/png" });

  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (error) {
      // Closing the sheet without choosing anything is not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      throw error;
    }
  }

  const url = URL.createObjectURL(image);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Later, so the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
