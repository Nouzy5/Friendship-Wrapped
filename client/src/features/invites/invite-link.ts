export function inviteUrl(token: string): string {
  return new URL(`/invite/${token}`, window.location.origin).toString();
}

export function canUseNativeShare(): boolean {
  return typeof navigator.share === "function";
}

/** Opens the phone's share sheet. Resolves false if the person dismissed it. */
export async function shareInviteLink(url: string, groupName: string): Promise<boolean> {
  try {
    await navigator.share({ title: `Join ${groupName} on Friendship Wrapped`, url });
    return true;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
