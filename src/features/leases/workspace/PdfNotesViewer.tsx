// PDF viewer for a lease document with notes: renders one page with pdf.js (canvas + selectable text layer),
// draws the saved highlights, and lets editors select text and attach a note to it (or note a whole page).
// The notes panel lists every note of the document; clicking one jumps to its page and highlight.
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Link } from 'react-router';
import { Alert, Button, Input, Select, Spinner, Textarea } from '../../../components/ui.tsx';
import { get, post } from '../../../api/client.ts';
import { useAsync } from '../../../lib/useAsync.ts';
import type { ClauseGroup, ClauseItem } from '../types.ts';
import { cx } from '../../../components/ui-utils.ts';
import { useConfirm, useToast } from '../../../components/feedback.ts';
import { useT } from '../../../i18n/index.tsx';
import { useAuth } from '../../../auth/useAuth.ts';
import { formatDateTime } from '../../../lib/format.ts';
import { errorText } from '../labels.ts';
import { loadPdfjs } from './pdfjs.ts';
import { NOTE_COLORS, selectionOnPage, useDocNotes, type DocNote, type NoteColor, type NoteRect } from './notes.ts';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** A note (on a selection or the whole page) or a clause (selection only) being written. */
interface Draft { page: number; quote: string | null; rects: NoteRect[]; kind?: 'note' | 'clause' }
interface Pending extends Draft { anchor: { x: number; y: number } }

const COMPOSER_WIDTH = 300;

/** Pixel position of the new-note box: under the end of the selection, kept inside the page horizontally. */
function draftPosition(draft: Draft, page: { w: number; h: number }) {
  const width = Math.min(COMPOSER_WIDTH, page.w - 16);
  const last = draft.rects[draft.rects.length - 1];
  if (!last) return { width, right: 8, top: 8 };
  const left = Math.min(Math.max(8, (last.x + last.w) * page.w - width / 2), page.w - width - 8);
  return { width, left, top: (last.y + last.h) * page.h + 8 };
}

function ColorPicker({ value, onChange }: { value: NoteColor; onChange: (c: NoteColor) => void }) {
  const t = useT();
  return (
    <div className="lw-note-colors" role="radiogroup" aria-label={t('leases.notes.color')}>
      {NOTE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={t(`leases.notes.color.${c}`)}
          title={t(`leases.notes.color.${c}`)}
          className={cx('lw-note-swatch', `lw-note-${c}`, value === c && 'lw-note-swatch-on')}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function NoteEditor({ initial, color: initialColor, onSave, onCancel, autoFocus }: {
  initial?: string; color?: NoteColor; onSave: (body: string, color: NoteColor) => Promise<void>; onCancel: () => void; autoFocus?: boolean;
}) {
  const t = useT();
  const [body, setBody] = useState(initial ?? '');
  const [color, setColor] = useState<NoteColor>(initialColor ?? 'yellow');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!body.trim()) return;
    setSaving(true);
    try {
      await onSave(body.trim(), color);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="lw-note-editor">
      <Textarea
        rows={3}
        value={body}
        maxLength={5000}
        autoFocus={autoFocus}
        placeholder={t('leases.notes.placeholder')}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="row-between">
        <ColorPicker value={color} onChange={setColor} />
        <div className="row" style={{ gap: 6 }}>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>{t('common.cancel')}</Button>
          <Button size="sm" variant="primary" loading={saving} disabled={!body.trim()} onClick={() => void save()}>{t('common.save')}</Button>
        </div>
      </div>
    </div>
  );
}

interface Taxonomies { lease: string[]; standard: string[] }

/** Tag the selected text as a clause: pick a type (both taxonomies, as in the Clauses tab) and an optional section. */
function ClauseEditor({ onSave, onCancel }: { onSave: (type: string, section: string) => Promise<void>; onCancel: () => void }) {
  const t = useT();
  const taxonomies = useAsync((signal) => get<Taxonomies>('/clauses/taxonomies', undefined, signal), []);
  const [type, setType] = useState('');
  const [section, setSection] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!type) return;
    setSaving(true);
    try {
      await onSave(type, section.trim());
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="lw-note-editor" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <Select autoFocus value={type} onChange={(e) => setType(e.target.value)} aria-label={t('leases.clauses.newType')} disabled={!taxonomies.data}>
        <option value="">{taxonomies.data ? t('leases.userClause.chooseType') : t('common.loading')}</option>
        {taxonomies.data && ([['leases.clauses.typeStandard', taxonomies.data.standard], ['leases.clauses.typeLease', taxonomies.data.lease]] as [string, string[]][]).map(([label, list]) => (
          <optgroup key={label} label={t(label)}>
            {list.map((name) => <option key={name} value={name}>{name}</option>)}
          </optgroup>
        ))}
      </Select>
      <Input value={section} maxLength={120} placeholder={t('leases.userClause.section')} aria-label={t('leases.userClause.section')} onChange={(e) => setSection(e.target.value)} />
      <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>{t('common.cancel')}</Button>
        <Button size="sm" variant="primary" loading={saving} disabled={!type} onClick={() => void save()}>{t('leases.userClause.save')}</Button>
      </div>
    </div>
  );
}

export default function PdfNotesViewer({ leaseId, docId, url, title, page, onPage, clauses, onClausesChanged }: {
  leaseId: string;
  docId: string;
  url: string;
  title: string;
  page: number;
  onPage: (page: number) => void;
  /** The lease's clauses (user-added ones on this document are highlighted). */
  clauses?: ClauseGroup[] | null;
  onClausesChanged?: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, session, isOrgAdmin, isSuperAdmin } = useAuth();
  const notes = useDocNotes(leaseId, docId);
  const [clauseInfo, setClauseInfo] = useState<ClauseItem | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [scale, setScale] = useState(1);
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [hasText, setHasText] = useState(true);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [filter, setFilter] = useState<'all' | 'page'>('all');

  const pageCount = pdf?.numPages ?? 0;
  const current = Math.min(Math.max(1, page), Math.max(1, pageCount || page));
  const all = useMemo(() => notes.data ?? [], [notes.data]);
  const onThisPage = all.filter((n) => n.page === current);
  const shown = filter === 'page' ? onThisPage : all;
  const userId = session?.user.id;
  const canChange = (n: DocNote) => canEdit && (n.created_by === userId || isOrgAdmin || isSuperAdmin);
  const userClauses = useMemo(
    () => (clauses ?? []).flatMap((g) => g.clauses).filter((c) => c.source === 'user' && c.document_id === docId && c.page === current && c.rects?.length),
    [clauses, docId, current],
  );

  // Load the document.
  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;
    setPdf(null);
    setLoadError(null);
    loadPdfjs()
      .then((pdfjs) => pdfjs.getDocument({ url }).promise)
      .then((d) => {
        doc = d;
        if (cancelled) void d.destroy();
        else setPdf(d);
      })
      .catch((err: Error) => !cancelled && setLoadError(err.message || ''));
    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [url]);

  // Track the available width (for "fit width").
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [pdf]);

  // Render the current page: canvas at device resolution, then the selectable text layer on top.
  useEffect(() => {
    if (!pdf || !width || !canvasRef.current || !textRef.current || !pageRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let textLayer: { cancel: () => void } | null = null;
    const canvas = canvasRef.current;
    const textDiv = textRef.current;
    const pageDiv = pageRef.current;
    setRendering(true);
    setPending(null);

    (async () => {
      const pdfjs = await loadPdfjs();
      const p = await pdf.getPage(current);
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const s = zoom === 'fit' ? Math.max(0.25, (width - 24) / base.width) : zoom;
      const viewport = p.getViewport({ scale: s });
      const dpr = window.devicePixelRatio || 1;
      const hiRes = p.getViewport({ scale: s * dpr });
      canvas.width = Math.floor(hiRes.width);
      canvas.height = Math.floor(hiRes.height);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      pageDiv.style.setProperty('--scale-factor', String(s));
      pageDiv.style.setProperty('--total-scale-factor', String(s));
      setScale(s);
      setPageSize({ w: Math.floor(viewport.width), h: Math.floor(viewport.height) });

      const task = p.render({ canvas, viewport: hiRes });
      renderTask = task;
      textDiv.replaceChildren();
      const layer = new pdfjs.TextLayer({ textContentSource: p.streamTextContent(), container: textDiv, viewport });
      textLayer = layer;
      await Promise.all([task.promise, layer.render()]);
      if (cancelled) return;
      setHasText(layer.textContentItemsStr.some((s) => s.trim()));
      setRendering(false);
    })().catch((err: Error) => {
      if (cancelled || err?.name === 'RenderingCancelledException' || err?.name === 'AbortException') return;
      setLoadError(err.message);
      setRendering(false);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [pdf, current, zoom, width]);

  // Keep the active note's highlight in view, and its card in the list.
  useEffect(() => {
    if (!activeId) return;
    // Scroll only inside the list (it sits below the PDF; the window should stay on the page being read).
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-note="${activeId}"]`);
    if (list && item && (item.offsetTop < list.scrollTop || item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)) {
      list.scrollTo({ top: Math.max(0, item.offsetTop - 8), behavior: 'smooth' });
    }
    const note = all.find((n) => n.id === activeId);
    const scroller = scrollRef.current;
    if (note && note.page === current && note.rects.length && scroller && pageSize && !rendering) {
      const top = note.rects[0].y * pageSize.h;
      if (top < scroller.scrollTop || top > scroller.scrollTop + scroller.clientHeight - 60) scroller.scrollTo({ top: Math.max(0, top - 80), behavior: 'smooth' });
    }
  }, [activeId, current, rendering, pageSize, all]);

  const onMouseUp = () => {
    textRef.current?.classList.remove('selecting');
    // Let the browser finish updating the selection first.
    window.setTimeout(() => {
      if (!pageRef.current) return;
      const sel = selectionOnPage(pageRef.current);
      setPending(sel && canEdit ? { page: current, quote: sel.quote, rects: sel.rects, anchor: sel.anchor } : null);
    }, 0);
  };

  // A plain click (no selection) on a highlight opens its note.
  const onClick = (e: ReactMouseEvent) => {
    if (!pageRef.current || !pageSize || window.getSelection()?.toString()) return;
    const box = pageRef.current.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    const inside = (r: NoteRect) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const hit = onThisPage.find((n) => n.rects.some(inside));
    if (hit) {
      setActiveId(hit.id);
      setPanelOpen(true);
      return;
    }
    setClauseInfo(userClauses.find((c) => c.rects?.some(inside)) ?? null);
  };

  const startNote = (d: Draft) => {
    setDraft(d);
    setPending(null);
    setEditingId(null);
    window.getSelection()?.removeAllRanges();
  };

  const saveClause = async (type: string, section: string) => {
    if (!draft || !draft.quote) return;
    try {
      await post(`/leases/${leaseId}/documents/${docId}/clauses`, { clause_type: type, section: section || null, text: draft.quote, page: draft.page, rects: draft.rects });
      setDraft(null);
      toast(t('leases.userClause.added', { type }));
      onClausesChanged?.();
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const saveDraft = async (body: string, color: NoteColor) => {
    if (!draft) return;
    try {
      const row = await notes.create({ ...draft, body, color });
      setDraft(null);
      setActiveId(row.id);
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const removeNote = async (n: DocNote) => {
    if (!(await confirm({ title: t('leases.notes.deleteTitle'), message: t('leases.notes.deleteBody'), confirmLabel: t('common.delete'), danger: true }))) return;
    try {
      await notes.remove(n.id);
      if (activeId === n.id) setActiveId(null);
    } catch (err) {
      toast(errorText(t, err), 'danger');
    }
  };

  const zoomBy = (dir: 1 | -1) => {
    const now = zoom === 'fit' ? scale : zoom;
    const next = dir > 0 ? ZOOMS.find((z) => z > now + 0.01) : [...ZOOMS].reverse().find((z) => z < now - 0.01);
    if (next) setZoom(next);
  };

  if (loadError) return <Alert tone="danger">{t('leases.notes.loadError')} {loadError}</Alert>;

  const pageNotes = onThisPage.filter((n) => !n.rects.length);

  return (
    <div className="lw-pv">
      <div className="lw-pv-main">
        <div className="lw-pv-bar">
          <div className="row" style={{ gap: 2 }}>
            <Button size="sm" variant="ghost" onClick={() => zoomBy(-1)} aria-label={t('leases.notes.zoomOut')} title={t('leases.notes.zoomOut')}>−</Button>
            <span className="lw-pv-zoom">{Math.round(scale * 100)}%</span>
            <Button size="sm" variant="ghost" onClick={() => zoomBy(1)} aria-label={t('leases.notes.zoomIn')} title={t('leases.notes.zoomIn')}>+</Button>
            <Button size="sm" variant={zoom === 'fit' ? 'secondary' : 'ghost'} onClick={() => setZoom('fit')}>{t('leases.notes.fit')}</Button>
          </div>
          <div className="row" style={{ gap: 6 }}>
            {canEdit && <Button size="sm" onClick={() => startNote({ page: current, quote: null, rects: [] })}>+ {t('leases.notes.addPage')}</Button>}
            <Button size="sm" variant={panelOpen ? 'secondary' : 'ghost'} onClick={() => setPanelOpen((v) => !v)} aria-pressed={panelOpen}>
              {t('leases.notes.title')} <span className="lw-docs-count">{all.length}</span>
            </Button>
          </div>
        </div>

        {canEdit && !rendering && !hasText && <p className="muted small lw-pv-hint">{t('leases.notes.scanned')}</p>}
        {canEdit && !rendering && hasText && !all.length && <p className="muted small lw-pv-hint">{t('leases.notes.hint')}</p>}

        <div className="lw-pv-scroll" ref={scrollRef}>
          {!pdf && <Spinner />}
          <div
            ref={pageRef}
            className="lw-pv-page"
            style={pageSize ? { width: pageSize.w, height: pageSize.h } : { visibility: 'hidden' }}
            onMouseDown={() => {
              setPending(null);
              setClauseInfo(null);
              textRef.current?.classList.add('selecting');
            }}
            onMouseUp={onMouseUp}
            onClick={onClick}
          >
            <canvas ref={canvasRef} aria-label={title} role="img" />
            <div className="lw-pv-highlights" aria-hidden="true">
              {onThisPage.flatMap((n) => n.rects.map((r, i) => (
                <div
                  key={`${n.id}-${i}`}
                  className={cx('lw-hl', `lw-note-${n.color}`, n.id === activeId && 'lw-hl-active')}
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                />
              )))}
              {userClauses.flatMap((c) => (c.rects ?? []).map((r, i) => (
                <div
                  key={`clause-${c.id}-${i}`}
                  className={cx('lw-hl lw-hl-clause', clauseInfo?.id === c.id && 'lw-hl-active')}
                  style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
                />
              )))}
              {draft && draft.page === current && draft.rects.map((r, i) => (
                <div key={`draft-${i}`} className="lw-hl lw-hl-draft" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }} />
              ))}
            </div>
            <div ref={textRef} className="textLayer" />
            {pageNotes.length > 0 && (
              <div className="lw-pv-pins">
                {pageNotes.map((n) => (
                  <button key={n.id} type="button" className={cx('lw-pv-pin', `lw-note-${n.color}`, n.id === activeId && 'lw-hl-active')} title={n.body} onClick={(e) => { e.stopPropagation(); setActiveId(n.id); setPanelOpen(true); }}>
                    ✎
                  </button>
                ))}
              </div>
            )}
            {pending && (
              <div className="lw-pv-pop" style={{ left: `${Math.min(pending.anchor.x * 100, 85)}%`, top: `${pending.anchor.y * 100}%` }} onMouseDown={(e) => e.stopPropagation()} onMouseUp={(e) => e.stopPropagation()}>
                <div className="row" style={{ gap: 4 }}>
                  <Button size="sm" variant="primary" onClick={() => startNote({ ...pending, kind: 'note' })}>✎ {t('leases.notes.add')}</Button>
                  <Button size="sm" variant="primary" onClick={() => startNote({ ...pending, kind: 'clause' })}>§ {t('leases.userClause.add')}</Button>
                </div>
              </div>
            )}
            {clauseInfo && clauseInfo.rects?.length && pageSize && (
              <div
                className="lw-pv-clauseinfo"
                style={draftPosition({ page: current, quote: null, rects: clauseInfo.rects }, pageSize)}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="row-between">
                  <strong>§ {clauseInfo.clause_type}</strong>
                  <button type="button" className="lw-link" aria-label={t('common.close')} onClick={() => setClauseInfo(null)}>✕</button>
                </div>
                <span className="lw-note-meta">
                  <span>👤 {t('leases.clauses.source.user')}{clauseInfo.created_by_name ? ` · ${clauseInfo.created_by_name}` : ''}</span>
                  {clauseInfo.section && <span>§ {clauseInfo.section}</span>}
                </span>
                <Link className="small" to={`?tab=clauses#clause-${encodeURIComponent(clauseInfo.clause_type)}`}>{t('leases.userClause.openInClauses')}</Link>
              </div>
            )}
            {draft && draft.page === current && pageSize && (
              // The new-note box opens next to the selection (or the top-right corner for a page note).
              <div
                className="lw-pv-composer"
                style={draftPosition(draft, pageSize)}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <span className="lw-note-meta">
                  {draft.kind === 'clause'
                    ? t('leases.userClause.newOn', { page: draft.page })
                    : draft.rects.length ? t('leases.notes.newOn', { page: draft.page }) : t('leases.notes.pageNote', { page: draft.page })}
                </span>
                {draft.quote && <blockquote className="lw-note-quote">{draft.quote}</blockquote>}
                {draft.kind === 'clause'
                  ? <ClauseEditor key={`${draft.page}-${draft.quote}`} onSave={saveClause} onCancel={() => setDraft(null)} />
                  : <NoteEditor key={`${draft.page}-${draft.quote}`} autoFocus onSave={saveDraft} onCancel={() => setDraft(null)} />}
              </div>
            )}
          </div>
        </div>
      </div>

      {panelOpen && (
        <aside className="lw-notes">
          <div className="row-between">
            <strong>{t('leases.notes.title')}</strong>
            <div className="lw-seg" role="group">
              <button type="button" className={cx(filter === 'all' && 'lw-seg-active')} onClick={() => setFilter('all')}>{t('leases.notes.all')} ({all.length})</button>
              <button type="button" className={cx(filter === 'page' && 'lw-seg-active')} onClick={() => setFilter('page')}>{t('leases.notes.thisPage')} ({onThisPage.length})</button>
            </div>
          </div>

          {notes.loading && !notes.data && <Spinner />}
          {notes.error && <Alert tone="danger">{notes.error}</Alert>}
          {notes.data && !shown.length && (
            <p className="muted small">{canEdit ? t('leases.notes.empty') : t('leases.notes.emptyReadOnly')}</p>
          )}

          <ol className="lw-notes-list" ref={listRef}>
            {shown.map((n) => (
              <li
                key={n.id}
                data-note={n.id}
                className={cx('lw-note', `lw-note-edge-${n.color}`, n.id === activeId && 'lw-note-active')}
                onClick={() => {
                  setActiveId(n.id);
                  if (n.page !== current) onPage(n.page);
                  // The list is below the PDF: bring the page back into view if it has scrolled off screen.
                  const viewer = scrollRef.current?.getBoundingClientRect();
                  if (viewer && (viewer.bottom < 80 || viewer.top > window.innerHeight)) scrollRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
              >
                <span className="lw-note-meta">
                  <span className="lw-note-page">{t('leases.notes.page', { page: n.page })}</span>
                  {n.author && <span>{n.author}</span>}
                  <span>{formatDateTime(n.created_at)}</span>
                  {n.updated_at !== n.created_at && <span>· {t('leases.notes.edited')}</span>}
                </span>
                {n.quote && <blockquote className="lw-note-quote">{n.quote}</blockquote>}
                {editingId === n.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <NoteEditor
                      autoFocus
                      initial={n.body}
                      color={n.color}
                      onCancel={() => setEditingId(null)}
                      onSave={async (body, color) => {
                        try {
                          await notes.update(n.id, { body, color });
                          setEditingId(null);
                        } catch (err) {
                          toast(errorText(t, err), 'danger');
                        }
                      }}
                    />
                  </div>
                ) : (
                  <p className="lw-note-body">{n.body}</p>
                )}
                {canChange(n) && editingId !== n.id && (
                  <div className="lw-note-actions" onClick={(e) => e.stopPropagation()}>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(n.id)}>{t('common.edit')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => void removeNote(n)}>{t('common.delete')}</Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </aside>
      )}
    </div>
  );
}
