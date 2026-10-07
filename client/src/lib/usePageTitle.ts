import { useEffect } from "react";

const APP_NAME = "Friendship Wrapped";

/** The browser tab's title (and what screen readers announce on arrival): "Memories · Friendship Wrapped". */
export function usePageTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
