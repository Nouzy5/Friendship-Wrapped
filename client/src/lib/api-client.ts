/** Mirrors the server's error envelope: `{ error: { code, message, details? } }`. */
type ErrorEnvelope = {
  error?: { code?: string; message?: string; details?: unknown };
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the server could not be reached at all (offline, server down). */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Sent as JSON, except FormData (file uploads), which is sent as multipart/form-data. */
  body?: unknown;
  signal?: AbortSignal;
};

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Calls the API on the current origin (`/api/...`) and throws `ApiError` on failure. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal } = options;

  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = { Accept: "application/json" };
  // For FormData the browser sets the multipart Content-Type, including its boundary.
  if (body !== undefined && !isFormData) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection and try again.");
  }

  const data = await readJson(res);

  if (!res.ok) {
    const envelope = (data ?? {}) as ErrorEnvelope;
    // A non-JSON 5xx usually means the dev proxy couldn't reach the API.
    if (!envelope.error && res.status >= 500) {
      throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection and try again.");
    }
    throw new ApiError(
      res.status,
      envelope.error?.code ?? "HTTP_ERROR",
      envelope.error?.message ?? `Request failed with status ${res.status}`,
      envelope.error?.details,
    );
  }

  return data as T;
}
