import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(intelligence): implement. See API/docs/CONTRACT.md.
export default function AssistantPage() {
  return (
    <div className="page">
      <PageHeader title="Lease Assistant" />
      <EmptyState icon="🚧" title="Lease Assistant">This page is being built.</EmptyState>
    </div>
  );
}
