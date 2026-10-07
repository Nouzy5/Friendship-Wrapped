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
    throw networkError();
  }

  const data = await readJson(res);
  if (!res.ok) throw toApiError(res.status, data);
  return data as T;
}

const networkError = () =>
  new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection and try again.");

function toApiError(status: number, data: unknown): ApiError {
  const envelope = (data ?? {}) as ErrorEnvelope;
  // A non-JSON 5xx usually means the dev proxy couldn't reach the API.
  if (!envelope.error && status >= 500) return networkError();
  return new ApiError(
    status,
    envelope.error?.code ?? "HTTP_ERROR",
    envelope.error?.message ?? `Request failed with status ${status}`,
    envelope.error?.details,
  );
}

/**
 * POSTs a multipart form like apiRequest, reporting upload progress (0–1) as it goes.
 * fetch() can't report upload progress, so this one uses XMLHttpRequest.
 */
export function apiUpload<T>(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `/api${path}`);
    request.setRequestHeader("Accept", "application/json");
    request.withCredentials = true;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(networkError());
    request.onload = () => {
      let data: unknown = null;
      try {
        data = request.responseText ? JSON.parse(request.responseText) : null;
      } catch {
        // Not JSON: handled as an error below.
      }
      if (request.status >= 200 && request.status < 300) resolve(data as T);
      else reject(toApiError(request.status, data));
    };
    request.send(form);
  });
}
