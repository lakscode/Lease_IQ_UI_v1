import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(leases): implement. See API/docs/CONTRACT.md.
export default function LeaseDetailsPage() {
  return (
    <div className="page">
      <PageHeader title="Lease details" />
      <EmptyState icon="🚧" title="Lease details">This page is being built.</EmptyState>
    </div>
  );
}
