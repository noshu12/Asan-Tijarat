// GROUP2-AUTH-FIX 2026-11-27
"use client";

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { AlertCircle, FileText, RefreshCw, Upload, UploadCloud, X } from 'lucide-react';
import { cn, formatFileSize } from '@/lib/utils';
import { UPLOAD_ACCEPT, isImageFile, validateUploadFile } from '@/lib/uploads';

/**
 * A draft file chosen in the registration wizard — the File itself plus the
 * object-URL preview used to show the trader exactly what they selected.
 * It is turned into the API payload (base64, images down-scaled) on submit.
 */
export interface KycFileDraft {
  file: File;
  name: string;
  size: number;
  mimeType: string;
  /** Object URL for images; empty string for PDFs. */
  previewUrl: string;
  isImage: boolean;
}

export interface KycDocumentUploadProps {
  label: string;
  hint: string;
  value: KycFileDraft | null;
  onChange: (draft: KycFileDraft | null) => void;
  className?: string;
  /** 'large' (default) = the full box with title + hint + file spec.
   * 'compact' = the preview's small box (short label + 'Tap to upload'
   * only), used for CNIC Front/Back (side-by-side) and NTN on Get Started. */
  variant?: 'compact' | 'large';
  /** Short label shown inside a compact box, e.g. 'CNIC FRONT'. */
  compactLabel?: string;
}

function createDraft(file: File): KycFileDraft {
  const image = isImageFile(file);
  return {
    file,
    name: file.name,
    size: file.size,
    mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : ''),
    previewUrl: image ? URL.createObjectURL(file) : '',
    isImage: image,
  };
}

/**
 * Step-3 upload box: click (or drop a file) to attach a real document, see a
 * live preview of the image, and remove/replace it before submitting.
 */
export function KycDocumentUpload({ label, hint, value, onChange, className, variant = 'large', compactLabel }: KycDocumentUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Object URLs are tracked and revoked on unmount. The ref starts empty and
  // nothing is created before the first mount completes, so React's StrictMode
  // mount→cleanup→mount cycle in dev cannot revoke a live preview.
  const urlsRef = useRef<string[]>([]);
  useEffect(() => () => {
    urlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const accept = (file: File | undefined) => {
    if (!file) return;
    const problem = validateUploadFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);

    const draft = createDraft(file);
    if (draft.previewUrl) urlsRef.current.push(draft.previewUrl);
    onChange(draft);
  };

  const clear = () => {
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    setError(null);
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {variant !== 'compact' && (
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        aria-label={label}
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {!value ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            accept(e.dataTransfer.files?.[0]);
          }}
          className={cn(
            'w-full rounded-2xl border-dashed text-center transition',
            variant === 'compact'
              ? 'px-2.5 py-3 border-[1.5px] border-[#b9d6c2] bg-asan-accent-light/60 dark:bg-asan-dark/20'
              : 'p-4 border-2',
            dragging
              ? 'border-asan-accent bg-asan-accent-light/70 dark:bg-asan-dark/30'
              : variant === 'compact'
                ? ''
                : 'border-slate-200 dark:border-slate-800 hover:border-asan-accent/50'
          )}
        >
          {variant === 'compact' ? (
            <>
              <Upload className="w-5 h-5 text-asan-accent mx-auto mb-1" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{compactLabel ?? label.toUpperCase()}</p>
              <p className="text-[11px] text-slate-500">Tap to upload</p>
            </>
          ) : (
            <>
              <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1" />
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Upload {label}</p>
              <p className="text-xs text-slate-400">{hint}</p>
              <p className="text-xs text-slate-400">PNG, JPG or PDF • max 5MB • click or drop a file</p>
            </>
          )}
        </button>
      ) : (
        <div className={cn(
          'rounded-2xl border-2 border-asan-border dark:border-asan-mid bg-asan-accent-light/60 dark:bg-asan-dark/20 flex items-center',
          variant === 'compact' ? 'p-2 gap-2' : 'p-3 gap-3'
        )}>
          {value.isImage ? (
            <Image
              src={value.previewUrl}
              alt={`${label} preview`}
              width={56}
              height={56}
              unoptimized
              className={cn(
                'rounded-xl object-cover border border-asan-border dark:border-asan-mid bg-white shrink-0',
                variant === 'compact' ? 'w-10 h-10' : 'w-14 h-14'
              )}
            />
          ) : (
            <span className={cn(
              'rounded-xl grid place-items-center border border-asan-border dark:border-asan-mid bg-white shrink-0',
              variant === 'compact' ? 'w-10 h-10' : 'w-14 h-14'
            )}>
              <FileText className="w-6 h-6 text-asan-accent" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{value.name}</p>
            <p className="text-xs text-slate-500">
              {formatFileSize(value.size)} • {value.isImage ? 'Image ready' : 'PDF ready'}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              title={`Replace ${label}`}
              onClick={() => inputRef.current?.click()}
              className={cn(
                'p-1.5 flex items-center justify-center rounded-lg text-slate-500 hover:bg-white dark:hover:bg-slate-800 transition',
                variant === 'compact' ? 'min-h-[36px] min-w-[36px]' : 'min-h-[44px] min-w-[44px]'
              )}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title={`Remove ${label}`}
              onClick={clear}
              className={cn(
                'p-1.5 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition',
                variant === 'compact' ? 'min-h-[36px] min-w-[36px]' : 'min-h-[44px] min-w-[44px]'
              )}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 text-xs font-semibold text-red-500">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
