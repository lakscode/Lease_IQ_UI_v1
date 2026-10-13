import { PageHeader, EmptyState } from '../../components/ui.tsx';

// TODO(account): implement. See API/docs/CONTRACT.md.
export default function ForgotPasswordPage() {
  return (
    <div className="page">
      <PageHeader title="Reset password" />
      <EmptyState icon="🚧" title="Reset password">This page is being built.</EmptyState>
    </div>
  );
}
