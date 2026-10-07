export const wrappedPath = (year: number, groupId: string) =>
  `/wrapped/${year}?${new URLSearchParams({ group: groupId })}`;

/**
 * Links from the Wrapped list carry this state, so closing the story can step back in
 * history (to the list, where you were) instead of adding another entry.
 */
export const fromListState = { fromWrappedList: true } as const;

export function cameFromList(state: unknown): boolean {
  return typeof state === "object" && state !== null && "fromWrappedList" in state && state.fromWrappedList === true;
}
