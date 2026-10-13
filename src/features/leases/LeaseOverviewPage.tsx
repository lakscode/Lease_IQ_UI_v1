import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(leases): implement. See API/docs/CONTRACT.md.
export default function LeaseOverviewPage() {
  return (
    <div className="page">
      <PageHeader title="Lease overview" />
      <EmptyState icon="🚧" title="Lease overview">This page is being built.</EmptyState>
    </div>
  );
}
