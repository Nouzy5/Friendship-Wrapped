import { useEffect, useRef, useState } from "react";

export type FacingMode = "user" | "environment";

export type CameraProblem =
  /** No getUserMedia: an old browser, or the page isn't served over HTTPS. */
  | "unsupported"
  | "denied"
  | "not-found"
  | "busy"
  | "unknown";

type CameraState = { status: "idle" | "starting" | "live" } | { status: "error"; problem: CameraProblem };

function toProblem(error: unknown): CameraProblem {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "unknown";
}

function stopStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) track.stop();
}

/**
 * Owns the live camera stream while `enabled` is true: starts it, attaches it to
 * `videoRef`, and releases the camera (turning off its light) when disabled or unmounted.
 */
export function useCamera(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [state, setState] = useState<CameraState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ status: "error", problem: "unsupported" });
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    setState({ status: "starting" });

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then(async (granted) => {
        if (cancelled) {
          stopStream(granted);
          return;
        }
        stream = granted;
        const video = videoRef.current;
        if (video) {
          video.srcObject = granted;
          await video.play().catch(() => undefined); // autoplay is allowed for muted inline video
        }
        if (!cancelled) setState({ status: "live" });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", problem: toProblem(error) });
      });

    return () => {
      cancelled = true;
      if (stream) stopStream(stream);
      if (videoRef.current) videoRef.current.srcObject = null;
      setState({ status: "idle" });
    };
  }, [enabled, facingMode, attempt]);

  return {
    videoRef,
    state,
    facingMode,
    flip: () => setFacingMode((mode) => (mode === "user" ? "environment" : "user")),
    retry: () => setAttempt((count) => count + 1),
  };
}
