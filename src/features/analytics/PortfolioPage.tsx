import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(analytics): implement. See API/docs/CONTRACT.md.
export default function PortfolioPage() {
  return (
    <div className="page">
      <PageHeader title="Portfolio" />
      <EmptyState icon="🚧" title="Portfolio">This page is being built.</EmptyState>
    </div>
  );
}
