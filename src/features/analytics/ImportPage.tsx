import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(analytics): implement. See API/docs/CONTRACT.md.
export default function ImportPage() {
  return (
    <div className="page">
      <PageHeader title="Import" />
      <EmptyState icon="🚧" title="Import">This page is being built.</EmptyState>
    </div>
  );
}
