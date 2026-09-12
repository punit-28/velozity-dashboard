import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@velozity.dev' },
  { role: 'Project Manager', email: 'pm1@velozity.dev' },
  { role: 'Developer', email: 'dev1@velozity.dev' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err?.response?.data?.error?.message ?? 'Login failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Velozity Global Solutions</h1>
        <p className="subtitle">Client Project Dashboard</p>

        {error && <div className="error-banner">{error}</div>}

        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>

        <div className="demo-accounts">
          <small>Seeded demo accounts (password: Password123!):</small>
          <ul>
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button type="button" onClick={() => setEmail(a.email)}>
                  {a.role}: {a.email}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </form>
    </div>
  );
}
