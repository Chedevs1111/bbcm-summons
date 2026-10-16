import { GENERATED_DOCUMENT_LABELS, USER_ROLES, USER_ROLE_LABELS } from '@bbcm/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Building2, History, Plus, ScrollText, Users } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { count } from '../lib/format';
import { useSession } from '../lib/session';
import type { Branch, ClauseLibraryEntry, FirmTemplate, LawFirm, SessionUser } from '../lib/types';
import {
  Badge, Button, Card, EmptyState, ErrorNotice, Field, Input, PageHeader, Select, Spinner,
} from '../components/ui';

type Tab = 'firms' | 'users' | 'templates' | 'clauses' | 'audit';

interface AuditEntryRow {
  id: string;
  action: string;
  entity: string;
  detail: string;
  ip: string;
  created_at: string;
  user_name: string | null;
}

export function Admin() {
  const [tab, setTab] = useState<Tab>('firms');

  const firms = useQuery({
    queryKey: ['admin', 'firms'],
    queryFn: () =>
      api.get<{ firms: Array<LawFirm & { counts: { branches: number; users: number; templates: number } }> }>(
        '/admin/firms',
      ),
  });
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<{ users: SessionUser[] }>('/admin/users'),
  });
  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<{ templates: FirmTemplate[] }>('/admin/templates'),
  });
  const clauses = useQuery({
    queryKey: ['admin', 'clauses'],
    queryFn: () => api.get<{ clauses: ClauseLibraryEntry[] }>('/admin/clauses'),
  });
  const audit = useQuery({
    queryKey: ['admin', 'audit'],
    queryFn: () => api.get<{ entries: AuditEntryRow[] }>('/admin/audit'),
  });

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: 'firms', label: 'Law Firms & Branches', icon: <Building2 className="size-4" />, count: firms.data?.firms.length },
    { id: 'users', label: 'Users', icon: <Users className="size-4" />, count: users.data?.users.length },
    { id: 'templates', label: 'Templates', icon: <ScrollText className="size-4" />, count: templates.data?.templates.length },
    { id: 'clauses', label: 'Clause Library', icon: <BookOpen className="size-4" />, count: clauses.data?.clauses.length },
    { id: 'audit', label: 'Audit Trail', icon: <History className="size-4" />, count: audit.data?.entries.length },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Administration"
        description="Manage your firm, branches, users, templates and audit history."
      />

      <div className="mb-6 flex flex-wrap gap-1 overflow-x-auto border-b border-slate-200">
        {tabs.map((option) => (
          <button
            key={option.id}
            onClick={() => setTab(option.id)}
            className={
              tab === option.id
                ? '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 border-gold-500 px-4 py-2 text-sm font-semibold text-gold-700'
                : '-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-2 text-sm text-slate-600 hover:text-slate-900'
            }
          >
            {option.icon}
            {option.label}
            {option.count !== undefined && (
              <span className="rounded-full bg-slate-100 px-1.5 text-xs">{option.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'firms' && (
        <Card>
          {firms.isLoading && <Spinner />}
          {firms.error && <div className="p-4"><ErrorNotice message={(firms.error as Error).message} /></div>}
          <ul className="divide-y divide-slate-100">
            {firms.data?.firms.map((firm) => (
              <li key={firm.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-navy-900 text-sm font-bold text-white">
                  {firm.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{firm.name}</p>
                  <p className="text-xs text-slate-500">
                    {[firm.city, firm.province, firm.phone, firm.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Badge>{count(firm.counts.branches, 'branch', 'branches')}</Badge>
                  <Badge tone="green">{count(firm.counts.users, 'user')}</Badge>
                  <Badge>{count(firm.counts.templates, 'template')}</Badge>
                </div>
              </li>
            ))}
          </ul>
          <BranchManager />
        </Card>
      )}

      {tab === 'users' && <UsersTab users={users.data?.users ?? []} loading={users.isLoading} />}

      {tab === 'templates' && (
        <Card>
          <ul className="divide-y divide-slate-100">
            {templates.data?.templates.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{template.name}</p>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {GENERATED_DOCUMENT_LABELS[template.document_type] ?? template.document_type}
                  </p>
                </div>
                {template.is_default === 1 && <Badge tone="green">default</Badge>}
                <Badge tone={template.is_active === 1 ? 'blue' : 'red'}>
                  {template.is_active === 1 ? 'active' : 'inactive'}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'clauses' && (
        <Card>
          {clauses.isLoading && <Spinner />}
          <ul className="divide-y divide-slate-100">
            {clauses.data?.clauses.map((clause) => (
              <li key={clause.id} className="p-4">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">{clause.title}</p>
                  <Badge tone="blue">{clause.category}</Badge>
                  <Badge>{clause.condition.replace(/_/g, ' ')}</Badge>
                  {clause.firm_id === null && <Badge>system</Badge>}
                </div>
                <p className="font-mono text-[11px] text-slate-400">{clause.key}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">{clause.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === 'audit' && (
        <Card>
          {audit.isLoading && <Spinner />}
          {audit.data?.entries.length === 0 && (
            <EmptyState
              icon={<History className="size-10" />}
              title="No activity recorded yet"
              description="Every sign-in, matter change and document export is logged here."
            />
          )}
          <ul className="divide-y divide-slate-100">
            {audit.data?.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-3 p-4 text-sm">
                <span className="font-mono text-xs text-gold-700">{entry.action}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700">
                  {entry.detail || entry.entity}
                </span>
                <span className="text-slate-500">{entry.user_name ?? 'system'}</span>
                <span className="text-xs text-slate-400">{entry.created_at}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function BranchManager() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState('');

  const branches = useQuery({
    queryKey: ['admin', 'branches'],
    queryFn: () => api.get<{ branches: Branch[] }>('/admin/branches'),
  });

  const create = useMutation({
    mutationFn: () => api.post('/admin/branches', { name, city }),
    onSuccess: async () => {
      toast.success('Branch added');
      setName('');
      setCity('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'firms'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not add the branch'),
  });

  return (
    <div className="border-t border-slate-200 p-4">
      <h3 className="mb-3 font-semibold text-slate-900">Branches</h3>

      <ul className="mb-4 divide-y divide-slate-100">
        {branches.data?.branches.map((branch) => (
          <li key={branch.id} className="flex items-center justify-between py-2 text-sm">
            <span className="font-medium text-slate-900">{branch.name}</span>
            <span className="text-slate-500">{branch.city}</span>
          </li>
        ))}
        {branches.data?.branches.length === 0 && (
          <li className="py-2 text-sm text-slate-500">No branches yet.</li>
        )}
      </ul>

      {error && <div className="mb-3"><ErrorNotice message={error} /></div>}

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Branch name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pretoria Main" />
        </Field>
        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Pretoria" />
        </Field>
        <Button disabled={!name || create.isPending} onClick={() => create.mutate()}>
          <Plus className="size-4" /> Add branch
        </Button>
      </div>
    </div>
  );
}

function UsersTab({ users, loading }: { users: SessionUser[]; loading: boolean }) {
  const queryClient = useQueryClient();
  const { user: currentUser } = useSession();
  const [showForm, setShowForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('attorney');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/admin/users', { full_name: fullName, email, role, password }),
    onSuccess: async () => {
      toast.success('User created');
      setShowForm(false);
      setFullName('');
      setEmail('');
      setPassword('');
      await queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create the user'),
  });

  // Only a super_admin may mint another super_admin; the API enforces this too.
  const assignableRoles = USER_ROLES.filter(
    (option) => option !== 'super_admin' || currentUser?.role === 'super_admin',
  );

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-200 p-4">
        <h2 className="font-semibold text-slate-900">Users</h2>
        <Button variant="secondary" onClick={() => setShowForm((open) => !open)}>
          <Plus className="size-4" /> New user
        </Button>
      </div>

      {showForm && (
        <div className="border-b border-slate-200 bg-slate-50 p-4">
          {error && <div className="mb-3"><ErrorNotice message={error} /></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </Field>
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value)}>
                {assignableRoles.map((option) => (
                  <option key={option} value={option}>{USER_ROLE_LABELS[option]}</option>
                ))}
              </Select>
            </Field>
            <Field label="Temporary password" required hint="At least 12 characters">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Button
              disabled={!fullName || !email || password.length < 12 || create.isPending}
              onClick={() => create.mutate()}
            >
              Create user
            </Button>
          </div>
        </div>
      )}

      {loading && <Spinner />}

      <ul className="divide-y divide-slate-100">
        {users.map((user) => (
          <li key={user.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-gold-500 text-xs font-bold text-white">
              {user.full_name.split(' ').slice(-2).map((part) => part[0]).join('').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{user.full_name}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
            </div>
            <Badge tone="blue">{USER_ROLE_LABELS[user.role] ?? user.role}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
