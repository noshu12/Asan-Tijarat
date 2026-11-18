"use client";

import React from 'react';
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

  if (!url) {
    return (
      <span
        role="img"
        aria-label={`${alt} — no photo uploaded`}
        title="No product photo uploaded"
        className={cn(
          'grid place-items-center bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
          className
        )}
      >
        <ImageOff className="w-4 h-4" />
      </span>
    );
  }

  // data:/blob: URLs cannot be optimised — keep the old plain <img> for them.
  if (/^(data:|blob:)/i.test(url)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt} className={className} />;
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
    />
  );
}
