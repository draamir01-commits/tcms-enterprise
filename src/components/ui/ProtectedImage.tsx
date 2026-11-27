import React, { useEffect, useState } from 'react';
import { auth } from '../../firebase';

interface ProtectedImageProps {
  fileId?: string;
  alt: string;
  fallbackText?: string;
  className?: string;
  fallbackClassName?: string;
}

export function ProtectedImage({
  fileId,
  alt,
  fallbackText = '?',
  className = 'w-9 h-9 rounded-full object-cover border border-slate-200',
  fallbackClassName = 'w-9 h-9 rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center text-xs font-semibold shrink-0',
}: ProtectedImageProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!fileId) {
      setSrc(null);
      setFailed(false);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;
    setFailed(false);

    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('Protected image unavailable');
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error('Not an image');
        objectUrl = URL.createObjectURL(blob);
        if (active) setSrc(objectUrl);
      } catch {
        if (active) {
          setSrc(null);
          setFailed(true);
        }
      }
    })();

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId]);

  if (!fileId || failed || !src) {
    const initials = (fallbackText || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');

    return (
      <div className={fallbackClassName} title={alt} aria-label={alt}>
        {initials || '?'}
      </div>
    );
  }

  return <img src={src} alt={alt} className={`${className} shrink-0`} onError={() => setFailed(true)} />;
}
