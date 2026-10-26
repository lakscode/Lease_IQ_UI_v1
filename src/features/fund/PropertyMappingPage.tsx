// Fund Administration → Property Mapping: which fund holds each property (lease from Lease Abstraction).
// Assign, move or unassign one property from its row, or many at once with the checkboxes. A property belongs to
// at most one fund; the fund's Properties tab shows the same mapping.
import { useState } from 'react';
import { Link } from 'react-router';
import { get, put } from '../../api/client.ts';
import { useAuth } from '../../auth/useAuth.ts';
import { Button, Card, EmptyState, ErrorState, Input, LeaseStatusBadge, PageHeader, Select, Spinner, StatTile } from '../../components/ui.tsx';
import { useToast } from '../../components/feedback.ts';
import { useT } from '../../i18n/index.tsx';
import { formatDate, formatMoney, formatNumber } from '../../lib/format.ts';
import { useAsync } from '../../lib/useAsync.ts';
import type { FundLease, FundStatus } from './types.ts';
import './fund.css';

interface PropertyMap {
  funds: { id: string; name: string; status: FundStatus }[];
  leases: (FundLease & { fund_id: string | null })[];
}

const UNASSIGNED = '__none__';

export default function PropertyMappingPage() {
  const t = useT();
  const toast = useToast();
  const { canEdit, currency } = useAuth();
  const map = useAsync((signal) => get<PropertyMap>('/fund/property-map', undefined, signal), []);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkFund, setBulkFund] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const money = (v: number) => formatMoney(v, currency);
  const annual = (l: { base_rent_monthly: number | null }) => (l.base_rent_monthly ?? 0) * 12;

  const funds = map.data?.funds ?? [];
  const leases = map.data?.leases ?? [];
  const fundName = new Map(funds.map((f) => [f.id, f.name]));
  const q = search.trim().toLowerCase();
  const rows = leases.filter((l) =>
    (!filter || (filter === UNASSIGNED ? !l.fund_id : l.fund_id === filter))
    && (!q || `${l.tenant_name ?? ''} ${l.landlord_name ?? ''} ${l.premises_address ?? ''} ${l.property_type ?? ''}`.toLowerCase().includes(q)));
  const mapped = leases.filter((l) => l.fund_id);
  const allShownSelected = rows.length > 0 && rows.every((l) => selected.has(l.id));

  /** Map leases to a fund (null = unassign); updates the list in place, then confirms. */
  const assign = async (leaseIds: string[], fundId: string | null, key: string) => {
    setSaving(key);
    try {
      await put('/fund/property-map', { lease_ids: leaseIds, fund_id: fundId });
      const ids = new Set(leaseIds);
      map.setData((d) => d && { ...d, leases: d.leases.map((l) => (ids.has(l.id) ? { ...l, fund_id: fundId } : l)) });
      toast(fundId
        ? t('fund.mapping.assigned', { n: leaseIds.length, fund: fundName.get(fundId) ?? '' })
        : t('fund.mapping.unassigned', { n: leaseIds.length }));
      if (key === 'bulk') setSelected(new Set());
    } catch (err) {
      toast((err as Error).message, 'danger');
    } finally {
      setSaving(null);
    }
  };

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(rows.map((l) => l.id)));

  return (
    <div className="page">
      <PageHeader title={t('nav.fund.properties')} subtitle={t('fund.mapping.subtitle')} />

      {map.loading && !map.data ? <Spinner /> : map.error ? <ErrorState error={map.error} onRetry={map.reload} /> : !leases.length ? (
        <Card>
          <EmptyState icon="⌂" title={t('fund.mapping.noLeasesTitle')} action={<Link to="/leases" className="btn btn-primary">{t('fund.mapping.goToLeases')}</Link>}>
            {t('fund.mapping.noLeasesBody')}
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="tiles">
            <StatTile label={t('fund.mapping.properties')} value={formatNumber(leases.length)} onClick={() => setFilter('')} />
            <StatTile label={t('fund.mapping.mapped')} value={formatNumber(mapped.length)} tone="success"
              hint={money(mapped.reduce((s, l) => s + annual(l), 0))} />
            <StatTile label={t('fund.mapping.unmapped')} value={formatNumber(leases.length - mapped.length)}
              tone={leases.length - mapped.length ? 'warning' : 'neutral'} onClick={() => setFilter(UNASSIGNED)} />
          </div>

          {funds.length > 0 && (
            <Card title={t('fund.mapping.byFund')} padded={false}>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t('fund.common.fund')}</th>
                      <th className="num">{t('fund.metrics.properties')}</th>
                      <th className="num">{t('fund.properties.area')}</th>
                      <th className="num">{t('fund.properties.annualRent')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funds.map((f) => {
                      const held = leases.filter((l) => l.fund_id === f.id);
                      return (
                        <tr key={f.id} className="clickable" onClick={() => setFilter(f.id)}>
                          <td><Link to={`/fund/funds/${f.id}`} className="fa-strong" onClick={(e) => e.stopPropagation()}>{f.name}</Link></td>
                          <td className="num">{held.length}</td>
                          <td className="num">{formatNumber(held.reduce((s, l) => s + (l.rentable_area ?? 0), 0))}</td>
                          <td className="num">{money(held.reduce((s, l) => s + annual(l), 0))}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card padded={false}>
            <div className="card-body fa-toolbar">
              <Input type="search" placeholder={t('fund.mapping.search')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('common.search')} />
              <label className="fa-filter">
                <span className="sr-only">{t('fund.common.fund')}</span>
                <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="">{t('fund.mapping.allProperties')}</option>
                  <option value={UNASSIGNED}>{t('fund.mapping.unmappedOnly')}</option>
                  {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </Select>
              </label>
            </div>

            {canEdit && selected.size > 0 && (
              <div className="card-body fa-bulkbar">
                <strong>{t('fund.mapping.selected', { n: selected.size })}</strong>
                <label className="fa-filter">
                  <span className="sr-only">{t('fund.mapping.assignTo')}</span>
                  <Select value={bulkFund} onChange={(e) => setBulkFund(e.target.value)}>
                    <option value="">{t('fund.mapping.assignTo')}</option>
                    {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </Select>
                </label>
                <Button variant="primary" size="sm" disabled={!bulkFund} loading={saving === 'bulk'} onClick={() => assign([...selected], bulkFund, 'bulk')}>
                  {t('fund.mapping.assign')}
                </Button>
                <Button size="sm" loading={saving === 'bulk-clear'} onClick={() => assign([...selected], null, 'bulk-clear')}>
                  {t('fund.mapping.unassign')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>{t('fund.mapping.clearSelection')}</Button>
              </div>
            )}

            {!funds.length && <p className="muted fa-pad">{t('fund.mapping.noFunds')} <Link to="/fund/funds?new=1">{t('fund.funds.new')}</Link></p>}

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {canEdit && (
                      <th className="fa-col-check">
                        <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label={t('fund.mapping.selectAll')} />
                      </th>
                    )}
                    <th>{t('fund.properties.tenant')}</th>
                    <th>{t('fund.properties.address')}</th>
                    <th className="num">{t('fund.properties.area')}</th>
                    <th className="num">{t('fund.properties.annualRent')}</th>
                    <th>{t('fund.properties.expires')}</th>
                    <th>{t('fund.common.status')}</th>
                    <th>{t('fund.common.fund')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      {canEdit && (
                        <td className="fa-col-check">
                          <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={l.tenant_name ?? l.id} />
                        </td>
                      )}
                      <td>
                        <Link to={`/leases/${l.id}`} className="fa-strong">{l.tenant_name ?? '—'}</Link>
                        {l.property_type && <div className="fa-sub">{l.property_type}</div>}
                      </td>
                      <td>{l.premises_address ?? '—'}</td>
                      <td className="num">{formatNumber(l.rentable_area)}</td>
                      <td className="num">{l.base_rent_monthly === null ? '—' : money(annual(l))}</td>
                      <td>{formatDate(l.expiration_date)}</td>
                      <td><LeaseStatusBadge status={l.status} /></td>
                      <td>
                        {canEdit ? (
                          <Select
                            className="fa-fund-select"
                            value={l.fund_id ?? ''}
                            disabled={saving === l.id || !funds.length}
                            onChange={(e) => assign([l.id], e.target.value || null, l.id)}
                            aria-label={t('fund.common.fund')}
                          >
                            <option value="">{t('fund.mapping.none')}</option>
                            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                          </Select>
                        ) : l.fund_id ? (
                          <Link to={`/fund/funds/${l.fund_id}`}>{fundName.get(l.fund_id)}</Link>
                        ) : <span className="muted">{t('fund.mapping.none')}</span>}
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={canEdit ? 8 : 7} className="muted">{t('fund.common.noMatches')}</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
