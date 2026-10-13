import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(leases): implement. See API/docs/CONTRACT.md.
export default function LeasesPage() {
  return (
    <div className="page">
      <PageHeader title="Leases" />
      <EmptyState icon="🚧" title="Leases">This page is being built.</EmptyState>
    </div>
  );
}
