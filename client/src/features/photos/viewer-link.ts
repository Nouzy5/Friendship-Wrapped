/**
 * Links from a feed into the photo viewer carry this state. Its back button can then
 * step back in history, which returns to the feed at the same scroll position.
 */
export const fromFeedState = { fromFeed: true } as const;

export function cameFromFeed(state: unknown): boolean {
  return typeof state === "object" && state !== null && "fromFeed" in state && state.fromFeed === true;
}

export const photoPath = (photoId: string) => `/photos/${photoId}`;
