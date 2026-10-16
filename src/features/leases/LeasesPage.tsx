// Leases: upload files, track processing (and drive it while the tab is open), browse leases.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Card, EmptyState, ErrorState, Field, Input, LeaseStatusBadge, Modal, PageHeader, Select, SortHeader, Spinner, StatTile } from '../../components/ui.tsx';
import { sortRows } from '../../components/ui-utils.ts';
import { useT } from '../../i18n/index.tsx';
import { useAuth } from '../../auth/useAuth.ts';
import { apiUrl, get, post } from '../../api/client.ts';
import { useAsync } from '../../lib/useAsync.ts';
import { daysUntil, formatDate, formatMoney } from '../../lib/format.ts';
import UploadZone from './UploadZone.tsx';
import FileCard from './FileCard.tsx';
import type { FilesResponse, LeaseListItem } from './types.ts';
import './leases.css';

const POLL_MS = 4000;

/** Keeps queued/processing files moving: calls POST /files/:id/process for one file at a time. */
function useProcessingDriver(data: FilesResponse | null, reload: () => void) {
  const dataRef = useRef(data);
  dataRef.current = data;
  const active = (data?.files ?? []).filter((f) => f.status === 'queued' || f.status === 'processing');
  const activeKey = active.map((f) => f.id).join(',');

  useEffect(() => {
    if (!activeKey) return;
    let stopped = false;
    let index = 0;
    const tick = async () => {
      const ids = activeKey.split(',');
      const id = ids[index % ids.length];
      index += 1;
      try {
        const res = await post<{ status: string }>(`/files/${id}/process`);
        const before = dataRef.current?.files.find((f) => f.id === id);
        if (!stopped && (res.status !== before?.status || res.status === 'processing' || res.status === 'queued')) reload();
      } catch {
        // ignore; next tick retries
      }
    };
    const timer = setInterval(() => {
      if (!stopped) tick();
    }, POLL_MS);
    tick();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [activeKey, reload]);
}

type LeaseSortKey = 'tenant_name' | 'premises_address' | 'status' | 'expiration_date' | 'base_rent_monthly' | 'document_count';

export default function LeasesPage() {
  const t = useT();
  const navigate = useNavigate();
  const { canEdit, currency } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const status = params.get('status') ?? '';
  const leaseSearch = params.get('lq') ?? '';
  const leaseStatus = params.get('ls') ?? '';
  const [searchInput, setSearchInput] = useState(search);
  const [leaseInput, setLeaseInput] = useState(leaseSearch);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendLease, setAmendLease] = useState('');
  const [sort, setSort] = useState<{ key: LeaseSortKey; dir: 'asc' | 'desc' }>({ key: 'tenant_name', dir: 'asc' });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // Debounce text search into the URL.
  useEffect(() => {
    const h = setTimeout(() => searchInput !== search && setParam('q', searchInput), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);
  useEffect(() => {
    const h = setTimeout(() => leaseInput !== leaseSearch && setParam('lq', leaseInput), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaseInput]);

  const files = useAsync((signal) => get<FilesResponse>('/files', { search, status }, signal), [search, status]);
  const leases = useAsync((signal) => get<LeaseListItem[]>('/leases', { search: leaseSearch, status: leaseStatus }, signal), [leaseSearch, leaseStatus]);
  const allLeases = useAsync((signal) => get<LeaseListItem[]>('/leases', undefined, signal), []);
  // Lease status and end date for the file cards (older APIs don't include them in /files).
  const leaseInfo = useMemo(() => new Map((allLeases.data ?? []).map((l) => [l.id, { status: l.status, expiration_date: l.expiration_date }])), [allLeases.data]);
  const health = useAsync(async (signal) => {
    try {
      const res = await fetch(apiUrl('/status'), { signal });
      return (await res.json()) as { checks: { name: string; ok: boolean; detail: string }[] };
    } catch {
      return null;
    }
  }, []);
  const dbCheck = health.data?.checks.find((c) => c.name === 'Database');

  const reloadAll = files.reload;
  useProcessingDriver(files.data, reloadAll);

  // Refresh the lease list when a file finishes.
  const completedKey = (files.data?.files ?? []).filter((f) => f.status === 'completed').map((f) => f.id).join(',');
  const { reload: reloadLeases } = leases;
  const { reload: reloadAllLeases } = allLeases;
  useEffect(() => {
    reloadLeases();
    reloadAllLeases();
  }, [completedKey, reloadLeases, reloadAllLeases]);

  const sortedLeases = useMemo(() => sortRows(leases.data ?? [], sort.key, sort.dir), [leases.data, sort]);
  const onSort = (key: LeaseSortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }));
  const summary = files.data?.summary;

  return (
    <div className="page">
      <PageHeader
        title={t('leases.title')}
        subtitle={t('leases.subtitle')}
        actions={canEdit && <Button onClick={() => setAmendOpen(true)}>{t('leases.upload.addAmendment')}</Button>}
      />

      {dbCheck && !dbCheck.ok && (
        <Alert tone="warning" title={t('leases.health.title')}>{t('leases.health.body')} <span className="muted small">({dbCheck.detail})</span></Alert>
      )}
      {files.data && !files.data.ai_configured && (
        <Alert tone="info" title={t('leases.health.aiTitle')}>{t('leases.health.aiBody')}</Alert>
      )}

      {canEdit ? (
        <Card><UploadZone onUploaded={reloadAll} /></Card>
      ) : (
        <Alert tone="info">{t('leases.upload.viewerNote')}</Alert>
      )}

      <div className="tiles">
        <StatTile label={t('leases.tiles.files')} value={summary?.files ?? '—'} onClick={() => setParam('status', '')} />
        <StatTile label={t('leases.tiles.documents')} value={summary?.documents ?? '—'} />
        <StatTile label={t('leases.tiles.processing')} value={summary?.processing ?? '—'} tone={summary?.processing ? 'warning' : 'neutral'} onClick={() => setParam('status', 'active')} />
        <StatTile label={t('leases.tiles.attention')} value={summary?.needs_attention ?? '—'} tone={summary?.needs_attention ? 'danger' : 'neutral'} onClick={() => setParam('status', 'attention')} />
      </div>

      <Card
        title={t('leases.files.title')}
        actions={
          <div className="row">
            <Input type="search" placeholder={t('leases.files.searchPlaceholder')} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} aria-label={t('common.search')} />
            <Select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label={t('common.status')}>
              <option value="">{t('leases.files.allStatuses')}</option>
              <option value="active">{t('leases.files.statusActive')}</option>
              <option value="completed">{t('leases.fileStatus.completed')}</option>
              <option value="failed">{t('leases.fileStatus.failed')}</option>
              <option value="attention">{t('leases.tiles.attention')}</option>
            </Select>
          </div>
        }
      >
        {files.loading && !files.data && <Spinner />}
        {files.error && <ErrorState error={files.error} onRetry={files.reload} />}
        {files.data && files.data.files.length === 0 && (
          <EmptyState icon="📂" title={search || status ? t('common.noResults') : t('leases.files.empty')}>
            {!search && !status && canEdit ? t('leases.files.emptyHint') : null}
          </EmptyState>
        )}
        <div className="lw-file-list">
          {files.data?.files.map((f) => <FileCard key={f.id} file={f} leaseInfo={leaseInfo} onChanged={() => { files.reload(); leases.reload(); allLeases.reload(); }} />)}
        </div>
      </Card>

      <Card
        title={t('leases.list.title')}
        padded={false}
        actions={
          <div className="row">
            <Input type="search" placeholder={t('leases.list.searchPlaceholder')} value={leaseInput} onChange={(e) => setLeaseInput(e.target.value)} aria-label={t('common.search')} />
            <Select value={leaseStatus} onChange={(e) => setParam('ls', e.target.value)} aria-label={t('common.status')}>
              <option value="">{t('leases.files.allStatuses')}</option>
              {['active', 'expiring', 'expired', 'renewed', 'unknown'].map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
            </Select>
          </div>
        }
      >
        {leases.loading && !leases.data && <div className="card-body"><Spinner /></div>}
        {leases.error && <div className="card-body"><ErrorState error={leases.error} onRetry={leases.reload} /></div>}
        {leases.data && leases.data.length === 0 && <EmptyState icon="🏢" title={leaseSearch || leaseStatus ? t('common.noResults') : t('leases.list.empty')} />}
        {sortedLeases.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortHeader label={t('leases.list.tenant')} column="tenant_name" sort={sort} onSort={onSort} />
                  <SortHeader label={t('leases.list.premises')} column="premises_address" sort={sort} onSort={onSort} />
                  <SortHeader label={t('common.status')} column="status" sort={sort} onSort={onSort} />
                  <SortHeader label={t('leases.list.expiration')} column="expiration_date" sort={sort} onSort={onSort} />
                  <SortHeader label={t('leases.list.rent')} column="base_rent_monthly" sort={sort} onSort={onSort} align="right" />
                  <SortHeader label={t('leases.list.documents')} column="document_count" sort={sort} onSort={onSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {sortedLeases.map((l) => {
                  const days = daysUntil(l.expiration_date);
                  return (
                    <tr key={l.id} className="clickable" onClick={() => navigate(`/leases/${l.id}`)}>
                      <td>
                        <Link to={`/leases/${l.id}`} className="cell-title" onClick={(e) => e.stopPropagation()}>{l.tenant_name || t('leases.unnamed')}</Link>
                        {l.landlord_name && <div className="cell-sub">{l.landlord_name}</div>}
                      </td>
                      <td className="lw-break">{l.premises_address || '—'}</td>
                      <td>
                        <LeaseStatusBadge status={l.status} />
                        {!l.main_document_id && <div className="cell-sub lw-err">{t('leases.alert.main_lease_missing_short')}</div>}
                      </td>
                      <td className="lw-nowrap">
                        {formatDate(l.expiration_date)}
                        {days !== null && days >= 0 && days <= 365 && <div className="cell-sub">{t('leases.list.inDays', { days })}</div>}
                      </td>
                      <td className="num">{formatMoney(l.base_rent_monthly, currency)}</td>
                      <td className="num">{l.document_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={amendOpen} title={t('leases.upload.addAmendment')} onClose={() => setAmendOpen(false)} wide>
        <div className="form">
          <Field label={t('leases.upload.chooseLease')}>
            <Select value={amendLease} onChange={(e) => setAmendLease(e.target.value)}>
              <option value="">—</option>
              {(allLeases.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>{l.tenant_name || t('leases.unnamed')}{l.premises_address ? ` — ${l.premises_address}` : ''}</option>
              ))}
            </Select>
          </Field>
          {amendLease ? (
            <UploadZone targetLeaseId={amendLease} onUploaded={reloadAll} compact />
          ) : (
            <p className="muted">{t('leases.upload.chooseLeaseHint')}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
