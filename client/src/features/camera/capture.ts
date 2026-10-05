/**
 * Grabs the current video frame as a JPEG. The front camera's preview is mirrored, so
 * its capture is mirrored too: the photo looks exactly like what you saw.
 */
export function captureFrame(video: HTMLVideoElement, mirror: boolean): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const context = canvas.getContext("2d");
  if (!context || canvas.width === 0) return Promise.reject(new Error("The camera isn't ready yet"));

  if (mirror) {
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't capture the photo"))),
      "image/jpeg",
      0.92,
    );
  });
}
