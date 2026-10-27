"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Crown, ImagePlus, UploadCloud, X } from 'lucide-react';
import { cn, formatFileSize } from '@/lib/utils';
import {
  IMAGE_UPLOAD_ACCEPT,
  MAX_PRODUCT_IMAGES,
  validateProductImage,
} from '@/lib/uploads';

/**
 * A photo the supplier picked from their device but has not submitted yet.
 * `previewUrl` is an object URL so the picture is visible before publishing;
 * the file itself is converted to a base64 payload on submit.
 */
export interface ProductImageDraft {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  previewUrl: string;
}

export interface ProductImageUploadProps {
  images: ProductImageDraft[];
  onChange: (images: ProductImageDraft[]) => void;
  /** Rendered under the grid (e.g. "at least one photo is required"). */
  error?: string;
  label?: string;
  className?: string;
}

function createDraft(file: File): ProductImageDraft {
  return {
    id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    name: file.name,
    size: file.size,
    mimeType: file.type || '',
    previewUrl: URL.createObjectURL(file),
  };
}

/**
 * Multi-photo picker for the Add Product form: click or drag pictures in from
 * the device, preview them, promote any one to be the cover ("Main"), and
 * remove them before publishing.
 */
export function ProductImageUpload({
  images,
  onChange,
  error,
  label = 'Product Photos',
  className,
}: ProductImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Every object URL this instance created is revoked on unmount. The ref is
  // empty until the first mount completes, so React's StrictMode
  // mount→cleanup→mount cycle in dev can never revoke a live preview.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const addFiles = (fileList: FileList | null | undefined) => {
    const picked = Array.from(fileList || []);
    if (picked.length === 0) return;

    const problems: string[] = [];
    const accepted: ProductImageDraft[] = [];

    for (const file of picked) {
      if (images.length + accepted.length >= MAX_PRODUCT_IMAGES) {
        problems.push(`Only ${MAX_PRODUCT_IMAGES} photos can be attached to one listing.`);
        break;
      }
      const problem = validateProductImage(file);
      if (problem) {
        problems.push(`${file.name}: ${problem}`);
        continue;
      }
      const draft = createDraft(file);
      urlsRef.current.push(draft.previewUrl);
      accepted.push(draft);
    }

    setLocalError(problems.length ? problems.join(' ') : null);
    if (accepted.length) onChange([...images, ...accepted]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (id: string) => {
    const target = images.find((image) => image.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    setLocalError(null);
    onChange(images.filter((image) => image.id !== id));
  };

  /** Promote a photo to the cover position (index 0 = the listing's main image). */
  const makeCover = (id: string) => {
    const target = images.find((image) => image.id === id);
    if (!target) return;
    onChange([target, ...images.filter((image) => image.id !== id)]);
  };

  const full = images.length >= MAX_PRODUCT_IMAGES;
  const message = error || localError;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</span>
        <span className="text-[11px] font-semibold text-slate-400">
          {images.length}/{MAX_PRODUCT_IMAGES} attached
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_UPLOAD_ACCEPT}
        multiple
        aria-label={label}
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((image, index) => (
          <div
            key={image.id}
            className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50"
          >
            <img
              src={image.previewUrl}
              alt={`${image.name} preview`}
              className="w-full h-32 object-cover"
            />

            {index === 0 ? (
              <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-asan-accent text-white text-[10px] font-bold shadow">
                <Crown className="w-3 h-3" />
                Main photo
              </span>
            ) : (
              <button
                type="button"
                onClick={() => makeCover(image.id)}
                title="Use as the main product photo"
                className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
              >
                Make main
              </button>
            )}

            <button
              type="button"
              onClick={() => removeAt(image.id)}
              title="Remove this photo"
              aria-label={`Remove ${image.name}`}
              className="absolute top-1.5 right-1.5 p-1 rounded-lg bg-black/60 text-white hover:bg-red-600 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="px-2 py-1.5">
              <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 truncate" title={image.name}>
                {image.name}
              </p>
              <p className="text-[10px] text-slate-400">{formatFileSize(image.size)}</p>
            </div>
          </div>
        ))}

        {!full && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              'h-[152px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 px-3 text-center transition',
              dragging
                ? 'border-asan-accent bg-emerald-50/70 dark:bg-emerald-950/30'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 hover:border-emerald-500/60'
            )}
          >
            {images.length === 0 ? (
              <UploadCloud className="w-6 h-6 text-slate-400" />
            ) : (
              <ImagePlus className="w-6 h-6 text-slate-400" />
            )}
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
              {images.length === 0 ? 'Upload product photo' : 'Add another photo'}
            </span>
            <span className="text-[10px] text-slate-400">
              Click or drop • JPG, PNG, WEBP • max 5MB • up to {MAX_PRODUCT_IMAGES}
            </span>
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-400">
        The photo marked <span className="font-semibold text-asan-accent">Main photo</span> is the one
        buyers, your dashboard and the admin panel see first.
      </p>

      {message && (
        <p className="flex items-start gap-1.5 text-xs font-semibold text-red-500">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          {message}
        </p>
      )}
    </div>
  );
}
