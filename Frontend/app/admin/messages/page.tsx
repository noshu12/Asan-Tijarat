"use client";

import React, { useEffect, useState } from 'react';
import { PortalHeader } from '@/components/PortalHeader';
import { Loader } from '@/components/ui/loader';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Mail, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { api, ContactMessage } from '@/lib/api';
import { useAuth } from '@/context/AuthProvider';
import { formatDate } from '@/lib/utils';

export default function AdminMessagesPage() {
  const { user, loading: authLoading } = useAuth();
  const [contacts, setContacts] = useState<ContactMessage[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [replyTarget, setReplyTarget] = useState<ContactMessage | null>(null);
  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const loadContacts = async () => {
    setError(null);
    try {
      const res = await api.admin.contacts(1, 100);
      const list = res && Array.isArray(res.contacts) ? res.contacts : [];
      setContacts(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role !== 'admin') {
      setLoading(false);
      return;
    }
    setLoading(true);
    void loadContacts();
  }, [authLoading, user]);

  const removeContact = async (c: ContactMessage) => {
    const ok = window.confirm(`Delete the message from ${c.name} (${c.email})? This cannot be undone.`);
    if (!ok) return;
    setBusyId(c.id);
    setMessage(null);
    setError(null);
    try {
      await api.admin.deleteContact(c.id);
      setMessage(`Message from ${c.name} deleted.`);
      if (selected && selected.id === c.id) setSelected(null);
      await loadContacts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusyId(null);
    }
  };

  const openReply = (c: ContactMessage) => {
    setReplyTarget(c);
    setReplySubject(`Re: ${c.subject || 'your message to Asan Tijarat'}`);
    setReplyBody('');
    setReplyError(null);
  };

  const sendReply = async () => {
    if (!replyTarget) return;
    if (!replySubject.trim()) {
      setReplyError('Please write a subject.');
      return;
    }
    if (!replyBody.trim()) {
      setReplyError('Please write your reply message.');
      return;
    }
    setReplySending(true);
    setReplyError(null);
    try {
      const res = await api.admin.replyContact(replyTarget.id, replySubject.trim(), replyBody.trim());
      setMessage(`Reply sent to ${res.to}.`);
      setReplyTarget(null);
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'Reply failed.');
    } finally {
      setReplySending(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader />
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8">
        <ShieldCheck className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900 dark:text-white">Admins only</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">Sign in with an admin account to read contact messages.</p>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? contacts.filter((c) =>
        `${c.name} ${c.email} ${c.subject || ''} ${c.message}`.toLowerCase().includes(q)
      )
    : contacts;

  return (
    <div className="space-y-6">
      <PortalHeader
        title="Messages"
        subtitle="Contact form messages from visitors — newest first"
      />
      {message && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          ✅ {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
          ⚠️ {error}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search name, email, subject or message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-2 w-full rounded-xl border border-slate-200 bg-white text-xs dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
          />
        </div>
        <Button type="button" variant="outline" onClick={() => void loadContacts()}>
          Refresh
        </Button>
      </div>
      {loading ? (
        <Loader />
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          <Mail className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {contacts.length === 0 ? 'No messages yet.' : 'No messages match the search.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Received</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelected(c)}
                      className="text-left"
                      title="Read the full message"
                    >
                      <p className="font-bold text-slate-900 dark:text-white text-xs">{c.name}</p>
                      <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{c.email}</p>
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    {c.subject || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[320px]">
                    <button
                      type="button"
                      onClick={() => setSelected(c)}
                      className="text-left truncate block w-full"
                      title="Read the full message"
                    >
                      {c.message.length > 90 ? `${c.message.slice(0, 90)}…` : c.message}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                    {c.createdAt ? formatDate(c.createdAt) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSelected(c)}
                      >
                        Read
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => openReply(c)}
                        title={`Reply to ${c.email}`}
                      >
                        <Mail className="w-3.5 h-3.5 mr-1.5" />
                        Reply
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busyId === c.id}
                        onClick={() => void removeContact(c)}
                        title="Delete this message"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        maxWidth="max-w-2xl"
        title={selected ? `Message from ${selected.name}` : ''}
        description={selected ? `${selected.email} · ${selected.createdAt ? formatDate(selected.createdAt) : ''}` : ''}
      >
        {selected && (
          <div className="space-y-4">
            {selected.subject && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Subject</p>
                <p className="text-sm font-bold text-slate-900 dark:text-white mt-1">{selected.subject}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Message</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 mt-1 whitespace-pre-wrap">{selected.message}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <Button
                type="button"
                onClick={() => {
                  const c = selected;
                  setSelected(null);
                  if (c) openReply(c);
                }}
              >
                <Mail className="w-3.5 h-3.5 mr-1.5" />
                Reply
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busyId === selected.id}
                onClick={() => void removeContact(selected)}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Delete message
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        isOpen={replyTarget !== null}
        onClose={() => setReplyTarget(null)}
        maxWidth="max-w-2xl"
        title={replyTarget ? `Reply to ${replyTarget.name}` : ''}
        description={replyTarget ? `To: ${replyTarget.email}` : ''}
      >
        {replyTarget && (
          <div className="space-y-4">
            {replyError && (
              <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3 text-sm text-red-700 dark:text-red-300">
                ⚠️ {replyError}
              </div>
            )}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Subject</label>
              <input
                type="text"
                value={replySubject}
                onChange={(e) => setReplySubject(e.target.value)}
                maxLength={200}
                className="mt-1 px-4 py-2 w-full rounded-xl border border-slate-200 bg-white text-sm dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Message</label>
              <textarea
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                rows={6}
                maxLength={5000}
                placeholder={`Hello ${replyTarget.name},`}
                className="mt-1 px-4 py-2 w-full rounded-xl border border-slate-200 bg-white text-sm dark:bg-slate-900 dark:border-slate-800 dark:text-white focus:outline-none focus:border-asan-accent transition"
              />
              <p className="text-[11px] text-slate-400 mt-1">{replyBody.length}/5000</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={replySending}
                isLoading={replySending}
                onClick={() => void sendReply()}
              >
                <Mail className="w-3.5 h-3.5 mr-1.5" />
                Send reply
              </Button>
              <Button type="button" variant="outline" onClick={() => setReplyTarget(null)}>
                Cancel
              </Button>
            </div>
            <p className="text-[11px] text-slate-400">
              The reply is sent from the Asan Tijarat email with branded formatting.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
