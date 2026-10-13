import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(account): implement. See API/docs/CONTRACT.md.
export default function OrganizationPage() {
  return (
    <div className="page">
      <PageHeader title="Organization" />
      <EmptyState icon="🚧" title="Organization">This page is being built.</EmptyState>
    </div>
  );
}
