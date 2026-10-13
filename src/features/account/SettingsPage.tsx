import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(account): implement. See API/docs/CONTRACT.md.
export default function SettingsPage() {
  return (
    <div className="page">
      <PageHeader title="Settings" />
      <EmptyState icon="🚧" title="Settings">This page is being built.</EmptyState>
    </div>
  );
}
