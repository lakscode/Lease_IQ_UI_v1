import { Navigate, Route, Routes } from 'react-router';
import AppLayout from './components/AppLayout.tsx';
import { RequireAuth, RequireRole } from './auth/RequireAuth.tsx';
import { EmptyState } from './components/ui.tsx';
import { useT } from './i18n/index.tsx';

// Account & administration
import LoginPage from './features/account/LoginPage.tsx';
import SignupPage from './features/account/SignupPage.tsx';
import ForgotPasswordPage from './features/account/ForgotPasswordPage.tsx';
import ResetPasswordPage from './features/account/ResetPasswordPage.tsx';
import AcceptInvitePage from './features/account/AcceptInvitePage.tsx';
import ProfilePage from './features/account/ProfilePage.tsx';
import OrganizationPage from './features/account/OrganizationPage.tsx';
import SettingsPage from './features/account/SettingsPage.tsx';
import LogsPage from './features/account/LogsPage.tsx';
// Leases
import LeasesPage from './features/leases/LeasesPage.tsx';
import LeaseOverviewPage from './features/leases/LeaseOverviewPage.tsx';
import LeaseDetailsPage from './features/leases/LeaseDetailsPage.tsx';
// Intelligence
import AssistantPage from './features/intelligence/AssistantPage.tsx';
// Analytics & data
import DashboardPage from './features/analytics/DashboardPage.tsx';
import PortfolioPage from './features/analytics/PortfolioPage.tsx';
import ReportsPage from './features/analytics/ReportsPage.tsx';
import ImportPage from './features/analytics/ImportPage.tsx';
// Fund administration
import FundOverviewPage from './features/fund/FundOverviewPage.tsx';
import FundsPage from './features/fund/FundsPage.tsx';
import FundDetailPage from './features/fund/FundDetailPage.tsx';
import InvestorsPage from './features/fund/InvestorsPage.tsx';
import CapitalCallsPage from './features/fund/CapitalCallsPage.tsx';
import DistributionsPage from './features/fund/DistributionsPage.tsx';
import ValuationsPage from './features/fund/ValuationsPage.tsx';
import PropertyMappingPage from './features/fund/PropertyMappingPage.tsx';

function NotFound() {
  const t = useT();
  return <EmptyState icon="🧭" title={t('notFound.title')} />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/invite/:token" element={<AcceptInvitePage />} />

      {/* Profile works even before the user belongs to an organization. */}
      <Route element={<RequireAuth allowNoOrg><AppLayout /></RequireAuth>}>
        <Route path="/profile" element={<ProfilePage />} />
      </Route>

      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/leases" element={<LeasesPage />} />
        <Route path="/leases/:leaseId" element={<LeaseOverviewPage />} />
        <Route path="/leases/:leaseId/details" element={<LeaseDetailsPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/assistant/:conversationId" element={<AssistantPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/import" element={<ImportPage />} />
        <Route path="/fund" element={<FundOverviewPage />} />
        <Route path="/fund/funds" element={<FundsPage />} />
        <Route path="/fund/funds/:fundId" element={<FundDetailPage />} />
        <Route path="/fund/properties" element={<PropertyMappingPage />} />
        <Route path="/fund/investors" element={<InvestorsPage />} />
        <Route path="/fund/capital-calls" element={<CapitalCallsPage />} />
        <Route path="/fund/distributions" element={<DistributionsPage />} />
        <Route path="/fund/nav" element={<ValuationsPage />} />
        <Route path="/organization" element={<RequireRole><OrganizationPage /></RequireRole>} />
        <Route path="/settings" element={<RequireRole superAdmin><SettingsPage /></RequireRole>} />
        <Route path="/logs" element={<RequireRole superAdmin><LogsPage /></RequireRole>} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
