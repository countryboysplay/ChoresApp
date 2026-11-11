import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../design/icons';
import { NeonArt } from '../design/neon';
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
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [canFlip, setCanFlip] = useState(false);

  // Reruns on a flip: the cleanup stops the old stream before the new one opens.
  useEffect(() => {
    let cancelled = false;
    setReady(false);

    void (async () => {
      try {
        const stream = await openCamera(facing);
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
        // Device labels and counts are only reliable once permission is granted.
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setCanFlip(devices.filter((device) => device.kind === 'videoinput').length > 1);
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
  }, [facing]);

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
        <div className="state-inline">
          <NeonArt group="states" name="camera-blocked" />
          <p style={{ margin: 0, fontWeight: 700 }}>{error}</p>
        </div>
        <Button tone="quiet" block icon="back" onClick={onCancel}>
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
          // The selfie camera is mirrored on screen only, like every phone camera app; the photo is not.
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            transform: facing === 'user' ? 'scaleX(-1)' : undefined,
          }}
        />
        {canFlip && (
          <button
            type="button"
            className="iconbtn"
            aria-label={facing === 'environment' ? 'Switch to front camera' : 'Switch to back camera'}
            disabled={!ready || busy}
            onClick={() => setFacing((current) => (current === 'environment' ? 'user' : 'environment'))}
            style={{ position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)', zIndex: 1 }}
          >
            <Icon name="camera-flip" size={22} />
          </button>
        )}
        {!ready && (
          <p
            aria-live="polite"
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              margin: 0,
              color: 'var(--text-strong)',
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
