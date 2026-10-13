import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(analytics): implement. See API/docs/CONTRACT.md.
export default function ReportsPage() {
  return (
    <div className="page">
      <PageHeader title="Reports" />
      <EmptyState icon="🚧" title="Reports">This page is being built.</EmptyState>
    </div>
  );
}
