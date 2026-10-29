"use client";

import React, { useEffect, useState } from 'react';
import { Download, FileText, ImageOff, ZoomIn } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { API_URL } from '@/lib/api';
import type { KycDocument, KycDocuments, UserRole } from '@/lib/types';
import { cn, formatDate, formatFileSize } from '@/lib/utils';

/** Every upload the registration wizard can collect, in review order. */
const ALL_DOCUMENT_SLOTS: { key: keyof KycDocuments; label: string }[] = [
  { key: 'cnicFront', label: 'CNIC Front Image' },
  { key: 'cnicBack', label: 'CNIC Back Image' },
  { key: 'ntn', label: 'NTN Certificate / Image' },
  { key: 'utilityBill', label: 'Shop Utility Bill' },
];

/**
 * Suppliers upload an NTN certificate, shopkeepers upload a shop utility bill
 * instead (no NTN since the 2026-10-29 redesign) — the third slot follows the role.
 */
function slotsForRole(role?: UserRole) {
  const thirdKey: keyof KycDocuments = role === 'shopkeeper' ? 'utilityBill' : 'ntn';
  return ALL_DOCUMENT_SLOTS.filter(
    (slot) => slot.key === 'cnicFront' || slot.key === 'cnicBack' || slot.key === thirdKey
  );
}

function isPdf(doc: KycDocument) {
  return (doc.mimeType || '').includes('pdf');
}

export interface KycDocumentViewerProps {
  documents?: KycDocuments | null;
  /** Id of the account whose documents these are — required for the admin KYC route. */
  userId?: string;
  /** Whose documents these are — shown in the lightbox so accounts never get mixed up. */
  ownerLabel?: string;
  /** Picks the third document slot: shopkeeper → utility bill, otherwise → NTN. */
  role?: UserRole;
  className?: string;
}

/**
 * Admin-side renderer for the KYC files a shopkeeper or supplier uploaded
 * during registration. Shows a thumbnail per document and opens the full-size
 * image (or the PDF) in a lightbox — the real files the trader submitted,
 * never a placeholder.
 *
 * Documents are loaded ONLY through the authenticated admin route
 * GET /api/admin/users/:id/kyc/:field (httpOnly cookie, admin role), never
 * through the raw /uploads/kyc path — that path is not publicly served, so
 * the old direct links 404'd. Each file is fetched as a blob and shown via
 * an object URL, which is revoked when the viewer unmounts or the preview
 * changes.
 */
export function KycDocumentViewer({ documents, userId, ownerLabel, role, className }: KycDocumentViewerProps) {
  const [preview, setPreview] = useState<{ key: string; label: string; doc: KycDocument } | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState<Record<string, boolean>>({});

  const slots = slotsForRole(role);

  // Load every uploaded document through the admin KYC route.
  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    if (!userId || !documents) {
      setBlobUrls({});
      setLoadFailed({});
      setLoading(false);
      return;
    }

    const activeSlots = slots.filter((slot) => documents[slot.key]?.url);
    if (activeSlots.length === 0) {
      setBlobUrls({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadFailed({});

    void Promise.all(
      activeSlots.map(async (slot) => {
        try {
          const response = await fetch(
            `${API_URL}/api/admin/users/${userId}/kyc/${slot.key}`,
            { credentials: 'include' }
          );
          if (!response.ok) throw new Error('KYC document could not be loaded.');
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          created.push(objectUrl);
          if (!cancelled) {
            setBlobUrls((prev) => ({ ...prev, [slot.key]: objectUrl }));
          }
        } catch {
          if (!cancelled) {
            setLoadFailed((prev) => ({ ...prev, [slot.key]: true }));
          }
        }
      })
    ).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      created.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, documents, role]);

  const uploadedCount = slots.filter((slot) => documents?.[slot.key]?.url).length;
  const previewUrl = preview ? blobUrls[preview.key] : undefined;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          Uploaded KYC Documents
        </p>
        <span
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
            uploadedCount === slots.length
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
              : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
          )}
        >
          {uploadedCount}/{slots.length} uploaded
        </span>
      </div>

      {!userId && uploadedCount > 0 && (
        <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          User id was not passed to this viewer, so documents cannot be loaded through the admin route.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {slots.map((slot) => {
          const doc = documents?.[slot.key];
          const url = doc?.url ? blobUrls[slot.key] : undefined;
          const failed = !!loadFailed[slot.key];

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
                {!doc?.url ? (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageOff className="w-5 h-5" />
                    <span className="text-[10px] font-semibold">Not uploaded</span>
                  </span>
                ) : loading && !url && !failed ? (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
                    <span className="text-[10px] font-semibold">Loading document…</span>
                  </span>
                ) : failed || !url ? (
                  <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400">
                    <ImageOff className="w-5 h-5" />
                    <span className="text-[10px] font-semibold">Could not load document</span>
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
                        disabled={!url}
                        onClick={() => url && setPreview({ key: slot.key, label: slot.label, doc })}
                        className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-40 disabled:no-underline"
                      >
                        View full size
                      </button>
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
              previewUrl ? (
                <iframe
                  key={preview.key}
                  src={`${previewUrl}#toolbar=1`}
                  title={`${preview.label} preview`}
                  className="w-full h-[65vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
                />
              ) : (
                <p className="text-xs text-slate-500">Document could not be loaded.</p>
              )
            ) : previewUrl ? (
              <img
                key={preview.key}
                src={previewUrl}
                alt={`${preview.label} full size`}
                className="w-full max-h-[65vh] object-contain rounded-xl bg-slate-100 dark:bg-slate-800"
              />
            ) : (
              <p className="text-xs text-slate-500">Document could not be loaded.</p>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Document on file for <span className="font-semibold">{ownerLabel || 'this account'}</span>,
                stored by the API and linked to their registration.
              </p>
              {previewUrl && (
                <a
                  href={previewUrl}
                  download={preview.doc.originalName || undefined}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-asan-accent hover:bg-asan-accent-hover text-white text-xs font-bold transition shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
