/**
 * ImageViewer - Simple image display component for standalone image files
 *
 * Displays image files (PNG, JPG, GIF, SVG, etc.) in the editor area.
 * Does not use Lexical - this is for viewing image files directly.
 */

import React, { useEffect, useState } from 'react';
import { ZoomableImageSurface } from '@nimbalyst/runtime/ui/AgentTranscript/components/ZoomableImageSurface';
import { nimAssetUrl } from '../utils/assetUrl';

interface ImageViewerProps {
  filePath: string;
  fileName: string;
}

function normalizeLocalImagePath(path: string): string {
  if (!path.startsWith('file://')) return path;

  const url = new URL(path);
  const hostPrefix = url.hostname ? `//${url.hostname}` : '';
  const decodedPath = decodeURIComponent(`${hostPrefix}${url.pathname}`);
  const windowsDrivePath = decodedPath.match(/^\/([A-Za-z]:\/.*)$/);
  return windowsDrivePath ? windowsDrivePath[1] : decodedPath;
}

export const ImageViewer: React.FC<ImageViewerProps> = ({ filePath, fileName }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadImage = async () => {
      try {
        // Issue #146: route through `nim-asset://` so the renderer stays
        // same-origin (lets `webSecurity: true` stay on the main window).
        // The main-process handler validates the path against allowlisted
        // workspace/userData roots or an exact image file authorized below.
        const absolute = normalizeLocalImagePath(filePath);
        if (typeof window.electronAPI.authorizeImageFile === 'function') {
          const authorization = await window.electronAPI.authorizeImageFile(absolute);
          if (!authorization.success) {
            throw new Error(authorization.error || 'Image file is not authorized');
          }
        }
        if (cancelled) return;
        setImageSrc(nimAssetUrl(absolute));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError('Failed to load image');
        console.error('Error loading image:', err);
      }
    };

    setImageSrc(null);
    setError(null);
    setDimensions(null);
    loadImage();

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  const handleImageError = () => {
    setError('Failed to load image');
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-nim-muted">
        <div className="text-center">
          <div className="text-5xl mb-4">📷</div>
          <div>{error}</div>
          <div className="text-xs mt-2 opacity-70">{fileName}</div>
        </div>
      </div>
    );
  }

  if (!imageSrc) {
    return (
      <div className="flex items-center justify-center h-full text-nim-muted">
        Loading...
      </div>
    );
  }

  return (
    <div className="image-viewer h-full bg-nim">
      <ZoomableImageSurface
        src={imageSrc}
        alt={fileName}
        copyFilePath={filePath}
        className="h-full"
        toolbarLabel={(
          <div className="flex min-w-0 items-center gap-3 text-xs text-nim-muted">
            <span className="truncate text-sm text-nim" title={fileName}>{fileName}</span>
            {dimensions ? (
              <span className="shrink-0 font-mono">
                {dimensions.width} × {dimensions.height}
              </span>
            ) : null}
          </div>
        )}
        onImageLoad={setDimensions}
        onImageError={handleImageError}
        imageClassName="shadow-none"
      />
    </div>
  );
};
