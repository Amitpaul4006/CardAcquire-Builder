import { FormEvent, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';
const tokenKey = 'cardacquire.accessToken';

type Application = {
  id: string;
  status: string;
  applicantName: string;
  submittedAt: string;
  riskScore?: number | null;
};

type Analytics = {
  totalApplications: number;
  approvalRate: number;
  rejectionRate: number;
  funnel: Array<{ stage: string; count: number }>;
  riskDistribution: Array<{ bucket: string; count: number }>;
  averageProcessingTimeMs: number;
  kycFailureReasons: Array<{ reason: string; count: number }>;
};

type ChatMessage = { role: 'assistant' | 'user'; text: string };

function roleFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replaceAll('-', '+').replaceAll('_', '/'))).role ?? null;
  } catch { return null; }
}

/** Sends authenticated requests and parses the API JSON contract. */
async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = sessionStorage.getItem(tokenKey);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Request failed');
  return body as T;
}

/** Collects applicant credentials and establishes a demo session. */
function AuthPanel({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const result = await apiRequest<{ tokens: { accessToken: string } }>(`/auth/${mode}`, {
        method: 'POST', body: JSON.stringify({ email, password }),
      });
      sessionStorage.setItem(tokenKey, result.tokens.accessToken);
      onAuthenticated();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Authentication failed');
    }
  }

  return (
    <form className="panel auth-panel" onSubmit={submit}>
      <p className="eyebrow">Applicant access</p>
      <h2>{mode === 'signup' ? 'Start an application' : 'Resume your application'}</h2>
      <label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label>Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button type="submit">{mode === 'signup' ? 'Create applicant account' : 'Sign in'}</button>
      <button className="text-button" type="button" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
        {mode === 'signup' ? 'Already registered? Sign in' : 'Need an account? Sign up'}
      </button>
    </form>
  );
}

/** Submits applicant details and an ID image as multipart form data. */
function ApplicationForm({ onSubmitted }: { onSubmitted: (application: Application) => void }) {
  const [name, setName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dedupeKey] = useState(() => crypto.randomUUID());
  const [document, setDocument] = useState<File | null>(null);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!document) { setError('Upload an identity document to continue.'); return; }
    const form = new FormData();
    form.set('applicantName', name); form.set('dateOfBirth', dateOfBirth);
    form.set('dedupeKey', dedupeKey); form.set('idDocument', document);
    try {
      const result = await apiRequest<{ application: Application }>('/applications', { method: 'POST', body: form });
      onSubmitted(result.application);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Submission failed');
    }
  }

  return (
    <form className="panel application-form" onSubmit={submit}>
      <div className="section-heading"><p className="eyebrow">01 / Applicant details</p><span>Secure intake</span></div>
      <h2>Tell us who is applying.</h2>
      <p className="muted">Your document is used for identity verification and is not sent to a real bank partner in this demo.</p>
      <label>Full legal name<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Date of birth<input required type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} /></label>
      <label className="upload">Identity document<input required type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setDocument(event.target.files?.[0] ?? null)} /><span>{document?.name ?? 'PNG, JPG, or WEBP up to 5 MB'}</span></label>
      {error && <p className="error">{error}</p>}
      <button type="submit">Submit for verification <span aria-hidden="true">→</span></button>
    </form>
  );
}

/** Polls the applicant-owned application until a terminal state is reached. */
function StatusTracker({ application, onSignOut }: { application: Application; onSignOut: () => void }) {
  const [current, setCurrent] = useState(application);
  useEffect(() => {
    if (['APPROVED', 'REJECTED'].includes(current.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const result = await apiRequest<{ application: Application }>(`/applications/${current.id}`);
        setCurrent(result.application);
      } catch { /* Preserve the last known status during transient polling errors. */ }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [current.id, current.status]);

  const stages = ['SUBMITTED', 'KYC_IN_PROGRESS', 'RISK_REVIEW', 'PARTNER_VERIFICATION', 'APPROVED'];
  const activeIndex = stages.indexOf(current.status);
  return (
    <section className="panel tracker">
      <div className="section-heading"><p className="eyebrow">02 / Application tracker</p><button className="text-button" onClick={onSignOut}>Sign out</button></div>
      <h2>{current.status === 'APPROVED' ? 'You are verified.' : current.status === 'REJECTED' ? 'Application review complete.' : 'Verification is underway.'}</h2>
      <p className="muted">Application {current.id.slice(0, 8)} · {current.applicantName}</p>
      <ol className="progress-list">{stages.map((stage, index) => <li className={index <= activeIndex && current.status !== 'REJECTED' ? 'active' : ''} key={stage}><span>{String(index + 1).padStart(2, '0')}</span>{stage.replaceAll('_', ' ')}</li>)}</ol>
      {current.status === 'REJECTED' && <p className="error">The application could not be approved during this review.</p>}
    </section>
  );
}

/**
 * Provides a guided, action-oriented assistant alongside the applicant flow.
 * It can open the application form and check an owned application, but it cannot
 * make lending decisions or bypass the API's authorization boundary.
 */
function AssistantPanel({ application, onStartApplication }: { application: Application | null; onStartApplication: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', text: 'Hi, I am the CardAcquire assistant. I can explain KYC, start an application, or check your progress.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((current) => [...current, { role: 'user', text }]);
    setBusy(true);
    try {
      const reply = await apiRequest<{ message: string; action: { type: string } }>('/assistant/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, applicationId: application?.id }),
      });
      setMessages((current) => [...current, { role: 'assistant', text: reply.message }]);
      if (reply.action.type === 'START_APPLICATION') onStartApplication();
    } catch {
      setMessages((current) => [...current, { role: 'assistant', text: 'Sign in first, then I can take actions on your application.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="assistant-panel">
      <div className="assistant-header"><span className="assistant-pulse" /><div><strong>CardAcquire AI</strong><small>Guided application assistant</small></div></div>
      <div className="assistant-capabilities"><button onClick={() => setInput('Explain KYC and the document checks')}>Explain KYC</button><button onClick={() => setInput('Start my application')}>Start application</button><button onClick={() => setInput('What is my application status?')}>Check status</button></div>
      <div className="assistant-messages">{messages.map((message, index) => <div className={`chat-bubble ${message.role}`} key={`${message.role}-${index}`}>{message.text}</div>)}</div>
      <form className="assistant-form" onSubmit={sendMessage}><input aria-label="Ask CardAcquire AI" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about your application..." /><button aria-label="Send message" type="submit">↑</button></form>
      <small className="assistant-note">AI assists with guidance and safe workflow actions. Decisions stay deterministic and auditable.</small>
    </aside>
  );
}

/**
 * Presents privacy-preserving operational metrics for admins.
 * Charts focus on conversion, throughput, and failure patterns so an operator
 * can identify funnel drop-off without exposing applicant identity data.
 */
function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    apiRequest<Analytics>('/admin/analytics').then(setAnalytics).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : 'Analytics unavailable');
    });
  }, []);
  const averageMinutes = analytics ? Math.round(analytics.averageProcessingTimeMs / 60000) : 0;
  return (
    <section className="dashboard">
      <div className="dashboard-heading"><div><p className="eyebrow">Operations / Admin view</p><h2>Acquisition health.</h2></div><button className="text-button" onClick={onSignOut}>Sign out</button></div>
      {error && <p className="error">{error}</p>}
      {!analytics ? <div className="panel loading">Loading analytics...</div> : <>
        <div className="metric-grid">
          <div className="metric"><span>Applications</span><strong>{analytics.totalApplications}</strong><small>all submitted</small></div>
          <div className="metric"><span>Approval rate</span><strong>{analytics.approvalRate}%</strong><small>converted</small></div>
          <div className="metric"><span>Rejection rate</span><strong>{analytics.rejectionRate}%</strong><small>reviewed</small></div>
          <div className="metric"><span>Avg. processing</span><strong>{averageMinutes}m</strong><small>submission to decision</small></div>
        </div>
        <div className="chart-grid">
          <div className="panel chart-panel"><div className="section-heading"><p className="eyebrow">Funnel drop-off</p><span>volume by stage</span></div><ResponsiveContainer width="100%" height={260}><BarChart data={analytics.funnel}><CartesianGrid stroke="#304040" vertical={false} /><XAxis dataKey="stage" tick={{ fill: '#8ea6a1', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8ea6a1', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#142020', border: '1px solid #536866' }} /><Bar dataKey="count" fill="#f0b86e" /></BarChart></ResponsiveContainer></div>
          <div className="panel chart-panel"><div className="section-heading"><p className="eyebrow">Risk distribution</p><span>score bands</span></div><ResponsiveContainer width="100%" height={260}><BarChart data={analytics.riskDistribution}><CartesianGrid stroke="#304040" vertical={false} /><XAxis dataKey="bucket" tick={{ fill: '#8ea6a1', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fill: '#8ea6a1', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#142020', border: '1px solid #536866' }} /><Bar dataKey="count" fill="#e07852" /></BarChart></ResponsiveContainer></div>
        </div>
        <div className="panel failure-panel"><div className="section-heading"><p className="eyebrow">KYC failure reasons</p><span>operator attention</span></div>{analytics.kycFailureReasons.length === 0 ? <p className="muted">No failure reasons recorded.</p> : analytics.kycFailureReasons.map((failure) => <div className="failure-row" key={failure.reason}><span>{failure.reason.replaceAll('_', ' ')}</span><strong>{failure.count}</strong></div>)}</div>
      </>}
    </section>
  );
}

/** Composes authentication, intake, and status views for the applicant funnel. */
export function App() {
  const [authenticated, setAuthenticated] = useState(Boolean(sessionStorage.getItem(tokenKey)));
  const [role, setRole] = useState<string | null>(() => roleFromToken(sessionStorage.getItem(tokenKey)));
  const [application, setApplication] = useState<Application | null>(null);
  return (
    <main>
      <header className="topbar"><strong>CardAcquire</strong><span>COBRANDED CREDIT / DEMO INTAKE</span></header>
      <section className="hero"><div><p className="eyebrow">A considered path to approval</p><h1>Identity first.<br /><em>Momentum always.</em></h1><p className="hero-copy">A transparent application experience for the next generation of cobranded credit.</p></div><div className="hero-mark">CA<span>01</span></div></section>
      <div className="experience-shell">
        <div className="experience-main">{!authenticated ? <AuthPanel onAuthenticated={() => { setAuthenticated(true); setRole(roleFromToken(sessionStorage.getItem(tokenKey))); }} /> : role === 'ADMIN' ? <AdminDashboard onSignOut={() => { sessionStorage.removeItem(tokenKey); setAuthenticated(false); setRole(null); }} /> : application ? <StatusTracker application={application} onSignOut={() => { sessionStorage.removeItem(tokenKey); setAuthenticated(false); setApplication(null); setRole(null); }} /> : <ApplicationForm onSubmitted={setApplication} />}</div>
        <AssistantPanel application={application} onStartApplication={() => { if (authenticated && role !== 'ADMIN') setApplication(null); }} />
      </div>
      <footer>CardAcquire is a portfolio demonstration. Bank and KYC services are simulated.</footer>
    </main>
  );
}