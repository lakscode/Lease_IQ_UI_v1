import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(account): implement. See API/docs/CONTRACT.md.
export default function ProfilePage() {
  return (
    <div className="page">
      <PageHeader title="Profile" />
      <EmptyState icon="🚧" title="Profile">This page is being built.</EmptyState>
    </div>
  );
}
