/** Where to send someone after they sign in: the page that asked them to, or home. */
export function postLoginPath(locationState: unknown): string {
  const from = (locationState as { from?: unknown } | null)?.from;

  const isSafeInternalPath =
    typeof from === "string" && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/auth");

  return isSafeInternalPath ? from : "/home";
}
