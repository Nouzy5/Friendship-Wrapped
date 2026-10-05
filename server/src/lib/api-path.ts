/** Where the API router is mounted. URLs handed to clients (e.g. image URLs) are built from it. */
export const API_PREFIX = "/api";

export function apiPath(path: string): string {
  return `${API_PREFIX}${path}`;
}
