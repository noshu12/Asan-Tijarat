"use client";

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { ImageOff } from 'lucide-react';
import { fileUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ProductImageProps {
  /** Stored photo path (`/uploads/products/<file>`) or an external URL. */
  src?: string | null;
  alt: string;
  className?: string;
  /** Fixed rendered size in px — for thumbs whose box is fixed (tables, cart). */
  width?: number;
  height?: number;
  /**
   * Fluid layout — the image fills its parent box (the parent must be sized,
   * e.g. aspect-square). `className` goes on the positioned wrapper, and
   * `imgClassName` (object-fit / hover zoom) on the <img> itself.
   */
  fill?: boolean;
  /** Responsive sizes hint (used with `fill`). */
  sizes?: string;
  /**
   * Natural aspect (width 100%, height auto) — for images whose own
   * dimensions are unknown at render time and whose box has no fixed height
   * (e.g. the admin preview of an uploaded photo).
   */
  natural?: boolean;
  /** Classes for the <img> itself (object-fit, hover zoom). Default object-cover. */
  imgClassName?: string;
  /** Only for the single above-the-fold image (product detail gallery). */
  priority?: boolean;
}

/**
 * The single place product photos are rendered (supplier dashboard & listings,
 * marketplace cards, cart, order rows, admin panel).
 *
 * Images the supplier uploaded are stored as server paths, so they are
 * resolved against the API origin here — seed/external URLs pass through
 * untouched. A listing without a photo shows a neutral empty state instead of
 * a stock placeholder image.
 *
 * FIX (New audit #7) — plain <img> replaced with next/image: lazy loading
 * offscreen by default, responsive srcsets, no layout shift (explicit
 * width/height, or fill inside a sized box). `data:`/`blob:` URLs (never
 * expected for product photos) still fall back to a plain <img>, since
 * next/image cannot optimise them.
 *
 * FIX (broken-image fallback) — a stored URL whose file is missing (404)
 * rendered the browser's broken-image icon. A load failure now renders the
 * same neutral placeholder as the no-photo case, in every render branch,
 * and the error state resets whenever the src changes so a reused
 * component retries the new image instead of staying stuck on the
 * placeholder.
 */
export function ProductImage({
  src,
  alt,
  className,
  width,
  height,
  fill,
  sizes,
  natural,
  imgClassName,
  priority,
}: ProductImageProps) {
  const url = fileUrl(src);

  // A stored URL whose file is missing (404) must not render the browser's
  // broken-image icon — treat a load failure like "no photo" instead.
  const [hasError, setHasError] = useState(false);

  // A reused component showing a different product must retry the new image,
  // not stay stuck on the placeholder from the previous src.
  useEffect(() => {
    setHasError(false);
  }, [url]);

  // The neutral placeholder already used for the no-photo case (grey box +
  // ImageOff icon, same classes) — reused for load failures too, so no new
  // asset is introduced.
  const renderPlaceholder = (unavailable: boolean, style?: React.CSSProperties) => (
    <span
      role="img"
      aria-label={
        unavailable ? `${alt} — photo unavailable` : `${alt} — no photo uploaded`
      }
      title={unavailable ? 'Product photo unavailable' : 'No product photo uploaded'}
      style={style}
      className={cn(
        'grid place-items-center bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
        className
      )}
    >
      <ImageOff className="w-4 h-4" />
    </span>
  );

  if (!url) {
    return renderPlaceholder(false);
  }

  if (hasError) {
    return renderPlaceholder(
      true,
      width !== undefined && height !== undefined ? { width, height } : undefined
    );
  }

  // data:/blob: URLs cannot be optimised — keep the old plain <img> for them.
  if (/^(data:|blob:)/i.test(url)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className={className} onError={() => setHasError(true)} />;
  }

  if (fill) {
    return (
      <span className={cn('relative block overflow-hidden', className)}>
        <Image
          src={url}
          alt={alt}
          fill
          sizes={sizes ?? '(max-width: 768px) 100vw, 50vw'}
          className={imgClassName ?? 'object-cover'}
          priority={priority}
          onError={() => setHasError(true)}
        />
      </span>
    );
  }

  if (natural) {
    return (
      <Image
        src={url}
        alt={alt}
        width={0}
        height={0}
        sizes="100vw"
        style={{ width: '100%', height: 'auto' }}
        className={className}
        priority={priority}
        onError={() => setHasError(true)}
      />
    );
  }

  if (width !== undefined && height !== undefined) {
    return (
      <Image
        src={url}
        alt={alt}
        width={width}
        height={height}
        className={className}
        priority={priority}
        onError={() => setHasError(true)}
      />
    );
  }

  // No sizing mode given — behave like the old <img> (natural aspect).
  return (
    <Image
      src={url}
      alt={alt}
      width={0}
      height={0}
      sizes="100vw"
      style={{ width: '100%', height: 'auto' }}
      className={className}
      priority={priority}
      onError={() => setHasError(true)}
    />
  );
}
