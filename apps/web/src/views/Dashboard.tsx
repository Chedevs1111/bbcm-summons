import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { CheckCircle2, FileEdit, FilePlus2, FileSearch, Files, Sparkles, Upload } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { statLabel } from '../lib/format';
import { useSession } from '../lib/session';
import type { MatterListResponse } from '../lib/types';
import { Badge, Button, Card, EmptyState, ErrorNotice, Input, Select, Spinner } from '../components/ui';

const STEPS = [
  { icon: <FilePlus2 className="size-5" />, title: 'Create', hint: 'Enter party details' },
  { icon: <Upload className="size-5" />, title: 'Upload', hint: 'Photos & PDFs' },
  { icon: <Sparkles className="size-5" />, title: 'AI Extract', hint: 'Claude reads docs' },
  { icon: <FileSearch className="size-5" />, title: 'Review', hint: 'Verify data' },
  { icon: <Files className="size-5" />, title: 'Generate', hint: 'Court-ready docs' },
];

const STATUS_TONE: Record<string, 'slate' | 'amber' | 'green' | 'blue'> = {
  draft: 'slate',
  active: 'blue',
  review: 'amber',
  generated: 'green',
  archived: 'slate',
};

export function Dashboard() {
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [status, setStatus] = useState('');

  const query = new URLSearchParams({ sort });
  if (search.trim()) query.set('search', search.trim());
  if (status) query.set('status', status);

  const { data, isLoading, error } = useQuery({
    queryKey: ['matters', sort, search, status],
    queryFn: () => api.get<MatterListResponse>(`/matters?${query}`),
  });

  const surname = user?.full_name.split(' ').pop() ?? '';

  return (
    <div className="mx-auto max-w-6xl">
      <Card className="reveal mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-navy-900 to-navy-800 px-6 py-8">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-400">
            BBCM Summons
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">Welcome back, {surname}</h1>
          <p className="mt-1 max-w-lg text-sm text-slate-300">
            Create a new divorce matter to get started with AI-powered document generation.
          </p>
          <div className="mt-5">
            <Link to="/matters/new">
              <Button>
                <FilePlus2 className="size-4" />
                New Matter
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      <Card className="reveal mb-6 p-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-semibold text-slate-900">How it works</h2>
          <span className="text-xs text-slate-500">5 simple steps</span>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-2 flex items-center gap-2 text-gold-600">
                <span className="grid size-6 place-items-center rounded-full bg-gold-100 text-xs font-bold">
                  {index + 1}
                </span>
                {step.icon}
              </div>
              <p className="text-sm font-semibold text-slate-900">{step.title}</p>
              <p className="text-xs text-slate-500">{step.hint}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Matters', singular: 'Total Matter', value: data?.stats.total ?? 0, icon: <Files className="size-5" />, tone: 'text-slate-600' },
          { label: 'Active', value: data?.stats.active ?? 0, icon: <FileEdit className="size-5" />, tone: 'text-blue-600' },
          { label: 'In Review', value: data?.stats.review ?? 0, icon: <FileSearch className="size-5" />, tone: 'text-amber-600' },
          { label: 'Complete', value: data?.stats.complete ?? 0, icon: <CheckCircle2 className="size-5" />, tone: 'text-emerald-600' },
        ].map((tile) => (
          <Card key={tile.label} className="reveal p-4">
            <div className={`mb-2 ${tile.tone}`}>{tile.icon}</div>
            <p className="text-2xl font-bold text-slate-900">{tile.value}</p>
            <p className="text-xs text-slate-500">{statLabel(tile.value, tile.label, tile.singular)}</p>
          </Card>
        ))}
      </div>

      <Card className="reveal">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, reference…"
            className="max-w-xs"
            aria-label="Search matters"
          />
          <Select value={sort} onChange={(e) => setSort(e.target.value)} className="w-auto" aria-label="Sort">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="name">Name</option>
            <option value="status">Status</option>
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto" aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="review">In Review</option>
            <option value="generated">Generated</option>
            <option value="archived">Archived</option>
          </Select>
          <span className="ml-auto text-sm text-slate-500">
            All Matters ({data?.matters.length ?? 0})
          </span>
        </div>

        {isLoading && <Spinner />}
        {error && (
          <div className="p-4">
            <ErrorNotice message={(error as Error).message} />
          </div>
        )}

        {data && data.matters.length === 0 && (
          <EmptyState
            icon={<Files className="size-10" />}
            title="No matters yet."
            description="Create your first divorce matter to get started."
            action={
              <Link to="/matters/new">
                <Button>Create Matter</Button>
              </Link>
            }
          />
        )}

        {data && data.matters.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {data.matters.map((matter) => (
              <li key={matter.id}>
                <Link
                  to={`/matters/${matter.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      {matter.plaintiff_surname || 'Unnamed'} v {matter.defendant_surname || '—'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {matter.case_reference || 'No reference'} · {matter.court_name || 'No court'}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[matter.status] ?? 'slate'}>{matter.status}</Badge>
                  <span className="w-28 text-right text-xs text-slate-400">
                    {matter.created_at
                      ? formatDistanceToNow(new Date(matter.created_at.replace(' ', 'T') + 'Z'), {
                          addSuffix: true,
                        })
                      : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
