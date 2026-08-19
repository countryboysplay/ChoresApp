/**
 * Live camera capture for chore proof.
 *
 * Deliberately no file input anywhere. The specification requires a photo taken
 * now, of the work just finished, and a gallery picker would let a child submit
 * last week's clean kitchen. `getUserMedia` cannot return a saved image, which
 * is why it is the only source here.
 */

/**
 * Longest edge after downscaling. A parent is checking whether the counter is
 * wiped on a phone screen; 1600px is more than enough for that, and it turns a
 * 4MB camera frame into roughly 200KB. Resizing here rather than on the server
 * also keeps the upload quick on house wifi and avoids a native image library
 * on the laptop.
 */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.85;

export type CameraError =
  | 'insecure-context'
  | 'unsupported'
  | 'permission-denied'
  | 'no-camera'
  | 'unknown';

export interface CameraFailure {
  kind: CameraError;
  message: string;
}

/**
 * Browsers only expose the camera to a secure context. That is https, or
 * localhost. Reaching the dev server over house wifi at http://192.168.x.x is
 * neither, so the camera is simply absent there - worth saying plainly rather
 * than letting it look broken.
 */
export function isSecureForCamera(): boolean {
  return window.isSecureContext;
}

export function cameraSupported(): boolean {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export async function openCamera(): Promise<MediaStream> {
  if (!isSecureForCamera()) {
    throw {
      kind: 'insecure-context',
      message:
        'The camera only works over https or on the laptop itself. Open Chore Quest on the laptop, or wait for the household address to be set up.',
    } satisfies CameraFailure;
  }

  if (!cameraSupported()) {
    throw { kind: 'unsupported', message: 'This browser cannot open the camera.' } satisfies CameraFailure;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      // The back camera on a phone, which is the one pointed at the chore.
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      audio: false,
    });
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      throw {
        kind: 'permission-denied',
        message: 'Camera access was blocked. Allow the camera for this site, then try again.',
      } satisfies CameraFailure;
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      throw { kind: 'no-camera', message: 'No camera was found on this device.' } satisfies CameraFailure;
    }
    throw { kind: 'unknown', message: 'The camera could not be opened.' } satisfies CameraFailure;
  }
}

export function closeCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

export interface CapturedPhoto {
  blob: Blob;
  /** Object URL for the preview. Revoke it when the preview goes away. */
  previewUrl: string;
  width: number;
  height: number;
}

/** Grabs the current frame, downscales it, and encodes it as JPEG. */
export async function capturePhoto(video: HTMLVideoElement): Promise<CapturedPhoto> {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  if (!sourceWidth || !sourceHeight) {
    throw { kind: 'unknown', message: 'The camera is not ready yet.' } satisfies CameraFailure;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.round(sourceWidth * scale);
  const height = Math.round(sourceHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw { kind: 'unknown', message: 'This browser cannot process the photo.' } satisfies CameraFailure;
  }
  context.drawImage(video, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolveBlob) => {
    canvas.toBlob(resolveBlob, 'image/jpeg', JPEG_QUALITY);
  });
  if (!blob) {
    throw { kind: 'unknown', message: 'The photo could not be saved.' } satisfies CameraFailure;
  }

  return { blob, previewUrl: URL.createObjectURL(blob), width, height };
}

export function isCameraFailure(value: unknown): value is CameraFailure {
  return typeof value === 'object' && value !== null && 'kind' in value && 'message' in value;
}
