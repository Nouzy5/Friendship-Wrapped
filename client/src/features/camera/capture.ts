/**
 * Grabs the current video frame as a square JPEG: the middle of the frame, exactly the part the
 * square viewfinder shows. With `mirror`, the photo is flipped like the front camera's preview
 * (Settings → Photos & data → Mirror front camera).
 */
export function captureFrame(video: HTMLVideoElement, mirror: boolean): Promise<Blob> {
  const { videoWidth, videoHeight } = video;
  const side = Math.min(videoWidth, videoHeight);
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;

  const context = canvas.getContext("2d");
  if (!context || side === 0) return Promise.reject(new Error("The camera isn't ready yet"));

  if (mirror) {
    context.translate(side, 0);
    context.scale(-1, 1);
  }
  context.drawImage(video, (videoWidth - side) / 2, (videoHeight - side) / 2, side, side, 0, 0, side, side);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't capture the photo"))), "image/jpeg", 0.92);
  });
}
