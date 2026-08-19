import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../design/icons';
import { Button } from '../design/primitives';
import {
  capturePhoto,
  closeCamera,
  isCameraFailure,
  openCamera,
  type CapturedPhoto,
} from '../lib/camera';

/**
 * The live camera. There is no "choose a file" escape hatch anywhere in here,
 * on purpose: proof has to be a photo of the work just finished.
 */
export function CameraCapture({
  onCaptured,
  onCancel,
}: {
  onCaptured: (photo: CapturedPhoto) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stream = await openCamera();
        if (cancelled) {
          closeCamera(stream);
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setReady(true);
      } catch (caught) {
        setError(isCameraFailure(caught) ? caught.message : 'The camera could not be opened.');
      }
    })();

    return () => {
      cancelled = true;
      // Leaving the camera running would sit there with the light on.
      closeCamera(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const take = useCallback(async () => {
    if (!videoRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await capturePhoto(videoRef.current);
      closeCamera(streamRef.current);
      streamRef.current = null;
      onCaptured(photo);
    } catch (caught) {
      setError(isCameraFailure(caught) ? caught.message : 'The photo could not be taken.');
    } finally {
      setBusy(false);
    }
  }, [busy, onCaptured]);

  if (error) {
    return (
      <div className="card card--status is-late stack">
        <div className="row" style={{ gap: 'var(--space-3)' }}>
          <Icon name="alert" size={22} />
          <p style={{ margin: 0, fontWeight: 700 }}>{error}</p>
        </div>
        <Button tone="quiet" block onClick={onCancel}>
          Go back
        </Button>
      </div>
    );
  }

  return (
    <div className="card stack">
      <div
        style={{
          position: 'relative',
          aspectRatio: '4 / 3',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          background: '#000',
        }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Camera preview"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
        {!ready && (
          <p
            aria-live="polite"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              margin: 0,
              color: '#fff',
            }}
          >
            Starting the camera&hellip;
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 'var(--space-3)' }}>
        <Button tone="quiet" block onClick={onCancel}>
          Cancel
        </Button>
        <Button tone="purple" size="lg" block icon="camera" disabled={!ready || busy} onClick={() => void take()}>
          {busy ? 'Taking…' : 'Take photo'}
        </Button>
      </div>
    </div>
  );
}
