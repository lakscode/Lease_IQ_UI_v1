// Rent roll import: Yardi Voyager, MRI or any CSV. Upload → automatic header detection and column mapping →
// preview with proposed lease matches → import. Imports can be reviewed, re-matched by hand and deleted.
import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { del, get, patch, post } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Field, PageHeader, Select, Spinner } from '../../components/ui.tsx';
import { useConfirm, useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import CloudPickerButtons from '../cloud/CloudPickerButtons.tsx';
import {
  RENT_ROLL_FIELDS, type ColumnMapping, type ImportPreview, type ImportSource, type RentRollImport, type RentRollRecord, type ReportData,
} from './types.ts';
import './analytics.css';

const SOURCES: ImportSource[] = ['yardi', 'mri', 'csv'];
const STEP_COUNT: Record<ImportSource, number> = { yardi: 5, mri: 5, csv: 4 };
const CSV_ACCEPT = ['text/csv', 'application/vnd.ms-excel', 'text/plain', '.csv', '.txt'];

const TEMPLATE_HEADERS = [
  'Tenant', 'Lease ID', 'Property', 'Unit', 'Status', 'Lease Start', 'Lease End', 'Square Feet', 'Monthly Base Rent',
  'Annual Base Rent', 'CAM', 'Tax', 'Insurance', 'Other Charges', 'Security Deposit', 'Next Escalation Date', 'Next Escalation Rent',
];
const TEMPLATE_ROW = [
  'Example Tenant LLC', 'T-1001', 'Harbor Point', 'Suite 400', 'Current', '2024-01-01', '2028-12-31', '12500', '52083.00',
  '624996.00', '1200.00', '800.00', '150.00', '0', '104166.00', '2027-01-01', '53645.49',
];

function downloadTemplate() {
  const csv = `${TEMPLATE_HEADERS.join(',')}\r\n${TEMPLATE_ROW.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')}\r\n`;
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lease-iq-rent-roll-template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** UTF-8 when valid, otherwise Windows-1252 (common for Excel/Yardi exports). */
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

export default function ImportPage() {
  const t = useT();
  const { canEdit } = useAuth();
  const [params, setParams] = useSearchParams();
  const selected = params.get('import');
  const list = useAsync((signal) => get<RentRollImport[]>('/imports', undefined, signal), []);

  const select = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('import', id);
    else p.delete('import');
    setParams(p, { replace: true });
  };

  return (
    <div className="page">
      <PageHeader title={t('nav.import')} subtitle={t('analytics.imp.subtitle')} />
      {!canEdit && <Alert tone="info">{t('analytics.imp.viewerNote')}</Alert>}
      {canEdit && <NewImport onImported={(id) => { list.reload(); select(id); }} />}
      <ImportList state={list} selected={selected} onSelect={select} />
      {selected && <ImportDetail key={selected} id={selected} onChanged={list.reload} onClose={() => select(null)} />}
    </div>
  );
}

function NewImport({ onImported }: { onImported: (id: string) => void }) {
  const t = useT();
  const toast = useToast();
  const [source, setSource] = useState<ImportSource>('yardi');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runPreview = useCallback(async (text: string, map: ColumnMapping | null) => {
    setBusy('preview');
    setError(null);
    try {
      const p = await post<ImportPreview>('/imports/preview', { csv: text, mapping: map });
      setPreview(p);
      setMapping(p.mapping);
    } catch (err) {
      setError((err as Error).message);
      setPreview(null);
    } finally {
      setBusy(null);
    }
  }, []);

  const loadFile = async (f: File) => {
    if (f.size > 8 * 1024 * 1024) return setError(t('analytics.imp.tooLarge'));
    const text = await readText(f);
    setFile({ name: f.name, text });
    setMapping(null);
    await runPreview(text, null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  };

  const changeMapping = (field: string, header: string) => {
    if (!file) return;
    const next = { ...(mapping ?? {}), [field]: header || null };
    setMapping(next);
    runPreview(file.text, next);
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const doImport = async () => {
    if (!file || !preview) return;
    setBusy('import');
    setError(null);
    try {
      const r = await post<{ import: RentRollImport; row_count: number; matched_count: number }>('/imports', {
        source, file_name: file.name, csv: file.text, mapping,
      });
      toast(t('analytics.imp.done', { rows: r.row_count, matched: r.matched_count }));
      reset();
      onImported(r.import.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title={t('analytics.imp.newTitle')}>
      <div className="stack" style={{ gap: 16 }}>
        <div className="an-sources" role="radiogroup" aria-label={t('analytics.imp.source')}>
          {SOURCES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={source === s} className={`an-source${source === s ? ' on' : ''}`} onClick={() => setSource(s)}>
              <strong>{t(`analytics.imp.src.${s}`)}</strong>
              <span className="muted small">{t(`analytics.imp.src.${s}.hint`)}</span>
            </button>
          ))}
        </div>

        <div className="grid-2 an-grid">
          <div className="stack">
            <h3>{t('analytics.imp.howTo', { source: t(`analytics.imp.src.${source}`) })}</h3>
            <ol className="an-steps">
              {Array.from({ length: STEP_COUNT[source] }, (_, i) => <li key={i}>{t(`analytics.imp.steps.${source}.${i + 1}`)}</li>)}
            </ol>
            <div><Button size="sm" onClick={downloadTemplate}>⬇ {t('analytics.imp.template')}</Button></div>
          </div>
          <div
            className={`an-drop${drag ? ' drag' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
          >
            <span style={{ fontSize: '1.6rem' }} aria-hidden="true">📄</span>
            <strong>{file ? file.name : t('analytics.imp.drop')}</strong>
            <span className="muted small">{t('analytics.imp.dropHint')}</span>
            <input ref={inputRef} type="file" accept=".csv,.txt,text/csv" className="sr-only" id="an-csv-input" onChange={(e) => e.target.files?.[0] && loadFile(e.target.files[0])} />
            <div className="row" style={{ justifyContent: 'center' }}>
              <Button size="sm" variant="primary" onClick={() => inputRef.current?.click()}>{t('analytics.imp.choose')}</Button>
              <CloudPickerButtons accept={CSV_ACCEPT} onPicked={(files) => files[0] && loadFile(files[0])} />
            </div>
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}
        {busy === 'preview' && !preview && <Spinner label={t('analytics.imp.reading')} />}

        {preview && file && (
          <div className="stack" style={{ gap: 14, opacity: busy === 'preview' ? 0.6 : 1 }}>
            <Alert tone={preview.mapping.tenant ? 'info' : 'warning'}>
              {t('analytics.imp.detected', {
                row: preview.header_row + 1,
                delimiter: preview.delimiter === '\t' ? 'Tab' : preview.delimiter,
                rows: preview.row_count,
                skipped: preview.skipped_rows,
              })}
              {!preview.mapping.tenant && <div><strong>{t('analytics.imp.chooseTenant')}</strong></div>}
            </Alert>

            <div>
              <h3 style={{ marginBottom: 8 }}>{t('analytics.imp.mapping')}</h3>
              <div className="an-mapping">
                {RENT_ROLL_FIELDS.map((f) => (
                  <div key={f} className={f === 'tenant' ? 'field-tenant' : undefined}>
                    <Field label={`${t(`analytics.rr.${f}`)}${f === 'tenant' ? ' *' : ''}`}>
                      <Select value={mapping?.[f] ?? ''} onChange={(e) => changeMapping(f, e.target.value)}>
                        <option value="">{t('analytics.imp.notMapped')}</option>
                        {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </Select>
                    </Field>
                  </div>
                ))}
              </div>
              {preview.charge_columns.length > 0 && (
                <p className="muted small" style={{ marginTop: 8 }}>{t('analytics.imp.chargeColumns', { cols: preview.charge_columns.join(', ') })}</p>
              )}
            </div>

            <div>
              <h3 style={{ marginBottom: 8 }}>
                {t('analytics.imp.preview')}{' '}
                <span className="muted small">{t('analytics.imp.previewMatched', { n: preview.matched_in_sample, total: preview.sample.length })}</span>
              </h3>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('analytics.tenant')}</th>
                      <th>{t('analytics.rr.unit')}</th>
                      <th>{t('analytics.start')}</th>
                      <th>{t('analytics.end')}</th>
                      <th className="num">{t('analytics.area')}</th>
                      <th className="num">{t('analytics.monthlyRent')}</th>
                      <th>{t('analytics.imp.match')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.sample.slice(0, 15).map((r, i) => (
                      <tr key={i}>
                        <td>{r.tenant ?? '—'}{r.external_id && <div className="cell-sub">{r.external_id}</div>}</td>
                        <td>{[r.property, r.unit].filter(Boolean).join(' · ') || '—'}</td>
                        <td>{formatDate(r.start_date)}</td>
                        <td>{formatDate(r.end_date)}</td>
                        <td className="num">{formatNumber(r.area)}</td>
                        <td className="num">{formatMoney(r.monthly_base_rent)}</td>
                        <td>
                          {r.match_lease_id ? (
                            <>{r.match_tenant}<div className="an-conf">{formatPercent(r.match_confidence ?? 0)}</div></>
                          ) : <Badge>{t('analytics.imp.unmatched')}</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.row_count > 15 && <p className="an-hint">{t('analytics.imp.moreRows', { n: preview.row_count - 15 })}</p>}
            </div>

            <div className="form-actions">
              <Button onClick={reset}>{t('common.cancel')}</Button>
              <Button variant="primary" onClick={doImport} loading={busy === 'import'} disabled={!preview.mapping.tenant || preview.row_count === 0 || busy !== null}>
                {t('analytics.imp.importN', { n: preview.row_count })}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function ImportList({ state, selected, onSelect }: {
  state: ReturnType<typeof useAsync<RentRollImport[]>>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useT();
  const { data, error, loading, reload } = state;
  return (
    <Card title={t('analytics.imp.history')} padded={false}>
      {error && <div className="card-body"><ErrorState error={error} onRetry={reload} /></div>}
      {loading && !data && <div className="card-body"><Spinner /></div>}
      {data && data.length === 0 && <EmptyState icon="📥" title={t('analytics.imp.none')}>{t('analytics.imp.noneBody')}</EmptyState>}
      {data && data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('analytics.imp.file')}</th>
                <th>{t('analytics.imp.source')}</th>
                <th>{t('analytics.imp.imported')}</th>
                <th className="num">{t('analytics.imp.rows')}</th>
                <th className="num">{t('analytics.imp.matched')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id} className="clickable" onClick={() => onSelect(selected === i.id ? null : i.id)} aria-selected={selected === i.id}>
                  <td><button type="button" className="sort-btn cell-title" style={{ textTransform: 'none' }}>{i.file_name ?? '—'}</button></td>
                  <td>{t(`analytics.imp.src.${i.source}`)}</td>
                  <td>{formatDateTime(i.created_at)}</td>
                  <td className="num">{formatNumber(i.row_count)}</td>
                  <td className="num">{formatNumber(i.matched_count)} <span className="muted small">({formatPercent(i.row_count ? i.matched_count / i.row_count : 0)})</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function ImportDetail({ id, onChanged, onClose }: { id: string; onChanged: () => void; onClose: () => void }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const { canEdit, currency } = useAuth();
  const { data, error, loading, reload, setData } = useAsync((signal) => get<{ import: RentRollImport; records: RentRollRecord[] }>(`/imports/${id}`, undefined, signal), [id]);
  const leases = useAsync((signal) => (canEdit ? get<ReportData>('/reports/leases', undefined, signal) : Promise.resolve(null)), [canEdit]);
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [saving, setSaving] = useState<string | null>(null);

  const rematch = async (record: RentRollRecord, leaseId: string) => {
    setSaving(record.id);
    try {
      const r = await patch<{ record: RentRollRecord; matched_count: number }>(`/imports/records/${record.id}`, { lease_id: leaseId || null });
      const lease = leases.data?.rows.find((l) => l.id === leaseId);
      setData((d) => d && {
        import: { ...d.import, matched_count: r.matched_count },
        records: d.records.map((x) => (x.id === record.id ? { ...x, ...r.record, lease_tenant_name: lease?.tenant_name ?? null, lease_premises: lease?.premises_address ?? null } : x)),
      });
      onChanged();
      toast(leaseId ? t('analytics.imp.rematched') : t('analytics.imp.unmatchedDone'));
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setSaving(null);
    }
  };

  const remove = async () => {
    if (!data) return;
    const ok = await confirm({ title: t('analytics.imp.deleteTitle'), message: t('analytics.imp.deleteBody', { name: data.import.file_name ?? '' }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    try {
      await del(`/imports/${id}`);
      toast(t('analytics.imp.deleted'));
      onChanged();
      onClose();
    } catch (err) {
      toast((err as Error).message, 'danger');
    }
  };

  const records = (data?.records ?? []).filter((r) => (filter === 'all' ? true : filter === 'matched' ? Boolean(r.lease_id) : !r.lease_id));

  return (
    <Card
      title={data ? `${data.import.file_name ?? t('analytics.imp.untitled')} · ${t(`analytics.imp.src.${data.import.source}`)}` : t('analytics.imp.records')}
      padded={false}
      actions={
        <>
          <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label={t('analytics.imp.show')}>
            <option value="all">{t('analytics.imp.showAll')}</option>
            <option value="matched">{t('analytics.imp.showMatched')}</option>
            <option value="unmatched">{t('analytics.imp.showUnmatched')}</option>
          </Select>
          {canEdit && <Button size="sm" variant="danger" onClick={remove}>{t('common.delete')}</Button>}
          <Button size="sm" variant="ghost" onClick={onClose} aria-label={t('common.close')}>✕</Button>
        </>
      }
    >
      {error && <div className="card-body"><ErrorState error={error} onRetry={reload} /></div>}
      {loading && !data && <div className="card-body"><Spinner /></div>}
      {data && (
        <>
          <div className="card-body an-totals">
            <span>{t('analytics.imp.rows')}: <strong>{formatNumber(data.import.row_count)}</strong></span>
            <span>{t('analytics.imp.matched')}: <strong>{formatNumber(data.import.matched_count)}</strong></span>
            <span>{t('analytics.imp.imported')}: <strong>{formatDateTime(data.import.created_at)}</strong></span>
          </div>
          {records.length === 0 ? <EmptyState icon="🔎" title={t('common.noResults')} /> : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('analytics.imp.systemTenant')}</th>
                    <th>{t('analytics.rr.unit')}</th>
                    <th>{t('analytics.end')}</th>
                    <th className="num">{t('analytics.monthlyRent')}</th>
                    <th>{t('analytics.imp.matchedLease')}</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="cell-title">{r.tenant ?? '—'}</span>
                        {r.external_id && <div className="cell-sub">{r.external_id}</div>}
                        {r.charge_codes && <div className="cell-sub">{Object.entries(r.charge_codes).map(([k, v]) => `${k}: ${formatMoney(v, currency, 2)}`).join(' · ')}</div>}
                      </td>
                      <td>{[r.property, r.unit].filter(Boolean).join(' · ') || '—'}</td>
                      <td>{formatDate(r.end_date)}</td>
                      <td className="num">{formatMoney(r.monthly_base_rent, currency, 2)}</td>
                      <td>
                        {canEdit && leases.data ? (
                          <Select className="input an-rematch" value={r.lease_id ?? ''} disabled={saving === r.id} onChange={(e) => rematch(r, e.target.value)} aria-label={t('analytics.imp.matchedLease')}>
                            <option value="">{t('analytics.imp.unmatched')}</option>
                            {leases.data.rows.map((l) => <option key={l.id} value={l.id}>{l.tenant_name ?? l.id.slice(0, 8)}{l.premises_address ? ` — ${l.premises_address}` : ''}</option>)}
                          </Select>
                        ) : r.lease_id ? (
                          <Link to={`/leases/${r.lease_id}`}>{r.lease_tenant_name ?? t('analytics.unnamed')}</Link>
                        ) : <Badge>{t('analytics.imp.unmatched')}</Badge>}
                        {r.lease_id && (
                          <div className="an-conf">
                            {t('analytics.imp.confidence', { pct: formatPercent(r.match_confidence ?? 0) })}
                            {canEdit && <> · <Link to={`/leases/${r.lease_id}`}>{t('analytics.imp.openLease')}</Link></>}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
