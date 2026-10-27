"use client";

import React from 'react';
import { ImageOff } from 'lucide-react';
import { fileUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

export interface ProductImageProps {
  /** Stored photo path (`/uploads/products/<file>`) or an external URL. */
  src?: string | null;
  alt: string;
  className?: string;
}

/**
 * The single place product photos are rendered (supplier dashboard & listings,
 * marketplace cards, cart, order rows, admin panel).
 *
 * Images the supplier uploaded are stored as server paths, so they are
 * resolved against the API origin here — seed/external URLs pass through
 * untouched. A listing without a photo shows a neutral empty state instead of
 * a stock placeholder image.
 */
export function ProductImage({ src, alt, className }: ProductImageProps) {
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

  return <img src={url} alt={alt} className={className} />;
}
