// Notes on lease document PDFs: API shapes and a list hook (see API routes/leases.ts, "PDF notes").
// Highlight rectangles are normalized to the page (0..1, from the top-left), so they line up at any zoom.
import { del, get, patch, post } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';

export const NOTE_COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface NoteRect { x: number; y: number; w: number; h: number }

export interface DocNote {
  id: string;
  document_id: string;
  page: number;
  quote: string | null;
  rects: NoteRect[];
  color: NoteColor;
  body: string;
  created_by: string | null;
  author: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoteDraft { page: number; quote: string | null; rects: NoteRect[]; color: NoteColor; body: string }

export function useDocNotes(leaseId: string, docId: string) {
  const list = useAsync((signal) => get<DocNote[]>(`/leases/${leaseId}/documents/${docId}/notes`, undefined, signal), [leaseId, docId]);
  const { setData } = list;
  const sort = (l: DocNote[]) => [...l].sort((a, b) => a.page - b.page || a.created_at.localeCompare(b.created_at));
  return {
    ...list,
    async create(draft: NoteDraft) {
      const row = await post<DocNote>(`/leases/${leaseId}/documents/${docId}/notes`, draft);
      setData((l) => sort([...(l ?? []), row]));
      return row;
    },
    async update(id: string, body: Partial<Pick<DocNote, 'body' | 'color'>>) {
      const row = await patch<DocNote>(`/leases/${leaseId}/notes/${id}`, body);
      setData((l) => (l ?? []).map((n) => (n.id === id ? row : n)));
    },
    async remove(id: string) {
      await del(`/leases/${leaseId}/notes/${id}`);
      setData((l) => (l ?? []).filter((n) => n.id !== id));
    },
  };
}

export type DocNotesApi = ReturnType<typeof useDocNotes>;

/**
 * Turn the current text selection inside `pageEl` into page-normalized rectangles (one per line fragment, with
 * fragments on the same line merged) and the selected text. Returns null when nothing on this page is selected.
 */
export function selectionOnPage(pageEl: HTMLElement): { quote: string; rects: NoteRect[]; anchor: { x: number; y: number } } | null {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!pageEl.contains(range.commonAncestorContainer)) return null;
  const quote = sel.toString().replace(/\s+/g, ' ').trim();
  if (!quote) return null;
  const box = pageEl.getBoundingClientRect();
  if (!box.width || !box.height) return null;

  const raw = [...range.getClientRects()]
    .filter((r) => r.width > 1 && r.height > 1)
    .map((r) => ({
      x: (Math.max(r.left, box.left) - box.left) / box.width,
      y: (Math.max(r.top, box.top) - box.top) / box.height,
      w: (Math.min(r.right, box.right) - Math.max(r.left, box.left)) / box.width,
      h: (Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top)) / box.height,
    }))
    .filter((r) => r.w > 0 && r.h > 0)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  // Merge fragments on the same line (vertical centres within half a line height).
  const rects: NoteRect[] = [];
  for (const r of raw) {
    const last = rects[rects.length - 1];
    if (last && Math.abs(last.y + last.h / 2 - (r.y + r.h / 2)) < Math.min(last.h, r.h) / 2) {
      const x = Math.min(last.x, r.x);
      const y = Math.min(last.y, r.y);
      last.w = Math.max(last.x + last.w, r.x + r.w) - x;
      last.h = Math.max(last.y + last.h, r.y + r.h) - y;
      last.x = x;
      last.y = y;
    } else {
      rects.push({ ...r });
    }
  }
  if (!rects.length) return null;
  const end = rects[rects.length - 1];
  return { quote: quote.slice(0, 2000), rects: rects.slice(0, 200), anchor: { x: end.x + end.w, y: end.y + end.h } };
}
