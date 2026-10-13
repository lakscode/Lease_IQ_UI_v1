import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatCurrency, formatDate } from '../utils/format.js';

function StatCard({ label, value, hint }) {
  return (
    <div className="card stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/dashboard/summary')
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = (user?.name || user?.email || '').split(/[\s@]/)[0];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Welcome back{firstName ? `, ${firstName}` : ''}</h1>
          <p className="muted">Here’s an overview of your lease portfolio.</p>
        </div>
        <Link to="/leases/upload" className="btn btn-primary">
          + Upload lease
        </Link>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!data && !error && <div className="muted">Loading dashboard…</div>}

      {data && (
        <>
          <section className="stats-grid">
            <StatCard label="Total leases" value={data.stats.totalLeases} />
            <StatCard label="Active leases" value={data.stats.activeLeases} />
            <StatCard label="Expiring in 90 days" value={data.stats.expiringSoon} hint="Needs attention" />
            <StatCard label="Monthly rent (active)" value={formatCurrency(data.stats.monthlyRent)} />
          </section>

          <section className="card">
            <div className="card-header">
              <h2>Recent uploads</h2>
            </div>
            {data.recentLeases.length === 0 ? (
              <div className="empty-state">
                <p>No leases uploaded yet.</p>
                <Link to="/leases/upload" className="btn btn-primary">
                  Upload your first lease
                </Link>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Lease</th>
                      <th>Tenant</th>
                      <th>Property</th>
                      <th>Term</th>
                      <th className="num">Monthly rent</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentLeases.map((lease) => (
                      <tr key={lease.id}>
                        <td>
                          <div className="cell-title">{lease.title}</div>
                          <div className="cell-sub">{lease.file_name}</div>
                        </td>
                        <td>{lease.tenant_name || '—'}</td>
                        <td>{lease.property_address || '—'}</td>
                        <td>
                          {formatDate(lease.start_date)} – {formatDate(lease.end_date)}
                        </td>
                        <td className="num">{formatCurrency(lease.monthly_rent)}</td>
                        <td>
                          <span className="badge">{lease.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
