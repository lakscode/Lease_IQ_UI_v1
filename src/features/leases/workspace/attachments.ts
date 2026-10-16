// Supporting documents (attachments) of one lease: API shapes, file-type helpers and a list hook that polls
// while AI reviews run. Kept out of the component files so those only export components (React Fast Refresh).
import { useEffect } from 'react';
import { del, get, patch, post } from '../../../api/client.ts';
import { supabase } from '../../../lib/supabase.ts';
import { useAsync } from '../../../lib/useAsync.ts';

export const CATEGORIES = ['exhibit', 'insurance', 'estoppel', 'snda', 'financial_statement', 'correspondence', 'notice', 'invoice', 'other'] as const;
export const EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md', 'eml', 'msg'];
export const ACCEPT = EXTENSIONS.map((e) => `.${e}`).join(',');

export interface Review {
  summary: string;
  key_date: string | null;
  amount: number | null;
  fields: Record<string, string>;
  action_items: { text: string; due_date: string | null }[];
  issues: { text: string; severity: string }[];
  suggested_category: string;
  reviewed_at?: string;
}

export interface Attachment {
  id: string;
  lease_id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  category: string | null;
  doc_date: string | null;
  notes: string | null;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  error: string | null;
  ai_review: Review | null;
  created_at: string;
}

export interface AttachmentMeta { category: string; doc_date: string; notes: string }

interface UploadUrl { attachment_id: string; bucket: string; path: string; token: string }

export const fileExt = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** How the browser can preview a file inline: in an iframe (PDF, plain text), as an image, or not at all. */
export function previewKind(name: string): 'frame' | 'image' | null {
  const ext = fileExt(name);
  if (['pdf', 'txt', 'csv', 'md'].includes(ext)) return 'frame';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image';
  return null;
}

/** Short label for the file-type tile in the document list. */
export function fileLabel(name: string): string {
  const ext = fileExt(name);
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'IMG';
  if (['eml', 'msg'].includes(ext)) return 'MAIL';
  return (ext || 'FILE').slice(0, 4).toUpperCase();
}

export const inlineUrl = (id: string) => get<{ url: string }>(`/attachments/${id}/download`, { inline: 1 });
export const downloadUrl = (id: string) => get<{ url: string }>(`/attachments/${id}/download`);

export function useAttachments(leaseId: string, aiOn: boolean) {
  const list = useAsync((signal) => get<Attachment[]>(`/leases/${leaseId}/attachments`, undefined, signal), [leaseId]);
  const { reload, setData } = list;

  // Poll while reviews run.
  const busy = (list.data ?? []).some((a) => a.status === 'processing' || (aiOn && a.status === 'queued'));
  useEffect(() => {
    if (!busy) return;
    const id = window.setInterval(reload, 5000);
    return () => window.clearInterval(id);
  }, [busy, reload]);

  const replace = (row: Attachment) => setData((l) => (l ?? []).map((x) => (x.id === row.id ? row : x)));

  return {
    ...list,
    async upload(file: File, meta: AttachmentMeta) {
      const target = await post<UploadUrl>(`/leases/${leaseId}/attachments/upload-url`, { file_name: file.name, file_size: file.size, mime_type: file.type || null });
      const { error } = await supabase.storage.from(target.bucket).uploadToSignedUrl(target.path, target.token, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw new Error(error.message);
      const row = await post<Attachment>(`/leases/${leaseId}/attachments`, {
        attachment_id: target.attachment_id, path: target.path, file_name: file.name, mime_type: file.type || null, file_size: file.size,
        category: meta.category || null, doc_date: meta.doc_date || null, notes: meta.notes || null,
      });
      setData((l) => [row, ...(l ?? [])]);
      return row;
    },
    async update(id: string, body: Partial<Record<'category' | 'doc_date' | 'notes', string | null>>) {
      replace(await patch<Attachment>(`/attachments/${id}`, body));
    },
    async review(id: string) {
      replace(await post<Attachment>(`/attachments/${id}/review`));
    },
    async remove(id: string) {
      await del(`/attachments/${id}`);
      setData((l) => (l ?? []).filter((x) => x.id !== id));
    },
  };
}

export type AttachmentsApi = ReturnType<typeof useAttachments>;
