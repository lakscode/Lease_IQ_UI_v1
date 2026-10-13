import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(account): implement. See API/docs/CONTRACT.md.
export default function ResetPasswordPage() {
  return (
    <div className="page">
      <PageHeader title="Choose a new password" />
      <EmptyState icon="🚧" title="Choose a new password">This page is being built.</EmptyState>
    </div>
  );
}
