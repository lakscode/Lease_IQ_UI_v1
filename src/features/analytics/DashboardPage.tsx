import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(analytics): implement. See API/docs/CONTRACT.md.
export default function DashboardPage() {
  return (
    <div className="page">
      <PageHeader title="Dashboard" />
      <EmptyState icon="🚧" title="Dashboard">This page is being built.</EmptyState>
    </div>
  );
}
