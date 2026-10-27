"use client";

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, FileText, RefreshCw, UploadCloud, X } from 'lucide-react';
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
export function KycDocumentUpload({ label, hint, value, onChange, className }: KycDocumentUploadProps) {
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
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>

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
            'w-full p-4 rounded-2xl border-2 border-dashed text-center transition',
            dragging
              ? 'border-asan-accent bg-emerald-50/70 dark:bg-emerald-950/30'
              : 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/50'
          )}
        >
          <UploadCloud className="w-6 h-6 text-slate-400 mx-auto mb-1" />
          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">Upload {label}</p>
          <p className="text-[10px] text-slate-400">{hint}</p>
          <p className="text-[10px] text-slate-400">PNG, JPG or PDF • max 5MB • click or drop a file</p>
        </button>
      ) : (
        <div className="p-3 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/20 flex items-center gap-3">
          {value.isImage ? (
            <img
              src={value.previewUrl}
              alt={`${label} preview`}
              className="w-14 h-14 rounded-xl object-cover border border-emerald-200 dark:border-emerald-800 bg-white shrink-0"
            />
          ) : (
            <span className="w-14 h-14 rounded-xl grid place-items-center border border-emerald-200 dark:border-emerald-800 bg-white shrink-0">
              <FileText className="w-6 h-6 text-emerald-600" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{value.name}</p>
            <p className="text-[10px] text-slate-500">
              {formatFileSize(value.size)} • {value.isImage ? 'Image ready' : 'PDF ready'}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              title={`Replace ${label}`}
              onClick={() => inputRef.current?.click()}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-white dark:hover:bg-slate-800 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              title={`Remove ${label}`}
              onClick={clear}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="flex items-center gap-1 text-[10px] font-semibold text-red-500">
          <AlertCircle className="w-3 h-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
