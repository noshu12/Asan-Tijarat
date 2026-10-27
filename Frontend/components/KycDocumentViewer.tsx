"use client";

import React, { useState } from 'react';
import { Download, ExternalLink, FileText, ImageOff, ZoomIn } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { fileUrl } from '@/lib/api';
import type { KycDocument, KycDocuments } from '@/lib/types';
import { cn, formatDate, formatFileSize } from '@/lib/utils';

/** The three uploads the registration wizard collects, in review order. */
const DOCUMENT_SLOTS: { key: keyof KycDocuments; label: string }[] = [
  { key: 'cnicFront', label: 'CNIC Front Image' },
  { key: 'cnicBack', label: 'CNIC Back Image' },
  { key: 'ntn', label: 'NTN Certificate / Image' },
];

function isPdf(doc: KycDocument) {
  return (doc.mimeType || '').includes('pdf');
}

export interface KycDocumentViewerProps {
  documents?: KycDocuments | null;
  /** Whose documents these are — shown in the lightbox so accounts never get mixed up. */
  ownerLabel?: string;
  className?: string;
}

/**
 * Admin-side renderer for the CNIC front/back + NTN files a shopkeeper or
 * supplier uploaded during registration. Shows a thumbnail per document and
 * opens the full-size image (or the PDF) in a lightbox — the real files the
 * trader submitted, never a placeholder.
 */
export function KycDocumentViewer({ documents, ownerLabel, className }: KycDocumentViewerProps) {
  const [preview, setPreview] = useState<{ key: string; label: string; doc: KycDocument } | null>(null);

  const uploadedCount = DOCUMENT_SLOTS.filter((slot) => documents?.[slot.key]?.url).length;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Uploaded KYC Documents
        </p>
        <span
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
            uploadedCount === DOCUMENT_SLOTS.length
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
          )}
        >
          {uploadedCount}/{DOCUMENT_SLOTS.length} uploaded
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {DOCUMENT_SLOTS.map((slot) => {
          const doc = documents?.[slot.key];
          const url = doc?.url ? fileUrl(doc.url) : '';

          return (
            <div
              key={slot.key}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
            >
              <button
                type="button"
                disabled={!url}
                onClick={() => url && doc && setPreview({ key: slot.key, label: slot.label, doc })}
                title={url ? `Preview ${slot.label}` : `${slot.label} was not uploaded`}
                className={cn(
                  'relative block w-full h-28 bg-slate-50 dark:bg-slate-800/50',
                  url ? 'cursor-zoom-in' : 'cursor-not-allowed'
                )}
              >
                {!url ? (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageOff className="w-5 h-5" />
                    <span className="text-[10px] font-semibold">Not uploaded</span>
                  </span>
                ) : isPdf(doc as KycDocument) ? (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-500">
                    <FileText className="w-6 h-6 text-emerald-600" />
                    <span className="text-[10px] font-bold">PDF document</span>
                  </span>
                ) : (
                  <>
                    <img src={url} alt={slot.label} className="w-full h-full object-cover" />
                    <span className="absolute bottom-1.5 right-1.5 p-1 rounded-lg bg-black/60 text-white">
                      <ZoomIn className="w-3.5 h-3.5" />
                    </span>
                  </>
                )}
              </button>

              <div className="p-2.5 space-y-1">
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">{slot.label}</p>
                {doc?.url ? (
                  <>
                    <p className="text-[10px] text-slate-500 truncate" title={doc.originalName}>
                      {doc.originalName || 'uploaded file'}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {formatFileSize(doc.size)}
                      {doc.uploadedAt ? ` • ${formatDate(doc.uploadedAt)}` : ''}
                    </p>
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setPreview({ key: slot.key, label: slot.label, doc })}
                        className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        View full size
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-asan-dark dark:hover:text-emerald-300"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Open
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="text-[10px] text-slate-400">No document submitted</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={preview !== null}
        onClose={() => setPreview(null)}
        maxWidth="max-w-3xl"
        title={preview ? `${preview.label} — ${ownerLabel || 'Registration'}` : ''}
        description={
          preview
            ? `${preview.doc.originalName || 'uploaded file'} • ${formatFileSize(preview.doc.size)}` +
              (preview.doc.uploadedAt ? ` • uploaded ${formatDate(preview.doc.uploadedAt)}` : '')
            : undefined
        }
      >
        {preview && (
          <div className="space-y-3">
            {isPdf(preview.doc) ? (
              <iframe
                key={preview.key}
                src={`${fileUrl(preview.doc.url)}#toolbar=1`}
                title={`${preview.label} preview`}
                className="w-full h-[65vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
              />
            ) : (
              <img
                key={preview.key}
                src={fileUrl(preview.doc.url)}
                alt={`${preview.label} full size`}
                className="w-full max-h-[65vh] object-contain rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Document on file for <span className="font-semibold">{ownerLabel || 'this account'}</span>,
                stored by the API and linked to their registration.
              </p>
              <a
                href={fileUrl(preview.doc.url)}
                download={preview.doc.originalName || undefined}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold transition shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
