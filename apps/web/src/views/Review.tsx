import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileSearch } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { statLabel } from '../lib/format';
import type { ReviewResponse } from '../lib/types';
import {
  Badge, Button, Card, ConfidenceBadge, EmptyState, ErrorNotice, Input, PageHeader, Spinner,
} from '../components/ui';

/** Anything below this needs an explicit look before it reaches a court document. */
const REVIEW_THRESHOLD = 0.8;

export function Review() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['review', id],
    queryFn: () => api.get<ReviewResponse>(`/matters/${id}/review`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!data) return;
    setEdits(Object.fromEntries(data.fields.map((field) => [field.field_name, field.value])));
  }, [data]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['review', id] });

  const confirmField = useMutation({
    mutationFn: ({ field, value }: { field: string; value: string }) =>
      api.patch(`/matters/${id}/review/${field}`, { value, confirmed: true }),
    onSuccess: refresh,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save'),
  });

  const confirmAll = useMutation({
    mutationFn: async () => {
      const pending = (data?.fields ?? []).filter((field) => field.confirmed === 0);
      for (const field of pending) {
        await api.patch(`/matters/${id}/review/${field.field_name}`, {
          value: edits[field.field_name] ?? field.value,
          confirmed: true,
        });
      }
      return pending.length;
    },
    onSuccess: async (count) => {
      toast.success(`${count} field${count === 1 ? '' : 's'} confirmed`);
      await refresh();
    },
  });

  const applyToMatter = useMutation({
    mutationFn: () => api.post<{ applied: number }>(`/matters/${id}/review/apply`),
    onSuccess: async (result) => {
      toast.success(`${result.applied} fields written to the matter`);
      await queryClient.invalidateQueries({ queryKey: ['matter', id] });
      await refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not apply'),
  });

  if (isLoading) return <Spinner />;

  const fields = data?.fields ?? [];
  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Review & Confirm"
        description="Verify every extracted value before it reaches a court document."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={confirmAll.isPending || fields.every((f) => f.confirmed === 1)}
              onClick={() => confirmAll.mutate()}
            >
              Confirm all
            </Button>
            <Button
              disabled={applyToMatter.isPending || (summary?.confirmed ?? 0) === 0}
              onClick={() => applyToMatter.mutate()}
            >
              Apply to matter
            </Button>
          </>
        }
      />

      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Fields extracted" singular="Field extracted" value={summary.total} />
          <Stat label="Confirmed" value={summary.confirmed} tone="text-emerald-600" />
          <Stat label="High confidence" value={summary.high_confidence} tone="text-blue-600" />
          <Stat label="Needs review" value={summary.needs_review} tone="text-amber-600" />
        </div>
      )}

      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <Card>
        <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">
          Extracted fields
        </h2>

        {fields.length === 0 && (
          <EmptyState
            icon={<FileSearch className="size-10" />}
            title="Nothing extracted yet"
            description="Upload a document and run extraction first."
            action={
              <Link to={`/matters/${id}/upload`}>
                <Button>Go to Upload &amp; Extract</Button>
              </Link>
            }
          />
        )}

        <ul className="divide-y divide-slate-100">
          {fields.map((field) => {
            const value = edits[field.field_name] ?? field.value;
            const changed = value !== field.extracted_value;
            const lowConfidence = field.confidence < REVIEW_THRESHOLD;

            return (
              <li
                key={field.id}
                className={lowConfidence && field.confirmed === 0 ? 'bg-amber-50/50' : undefined}
              >
                <div className="flex flex-wrap items-end gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">{field.field_name}</span>
                      <ConfidenceBadge value={field.confidence} />
                      {field.confirmed === 1 && <Badge tone="green">Confirmed</Badge>}
                      {changed && <Badge tone="amber">Edited</Badge>}
                    </div>
                    <Input
                      value={value}
                      onChange={(e) =>
                        setEdits((current) => ({ ...current, [field.field_name]: e.target.value }))
                      }
                    />
                    {changed && (
                      <p className="mt-1 text-xs text-slate-500">
                        Claude read: <span className="font-mono">{field.extracted_value || '(nothing)'}</span>
                      </p>
                    )}
                  </div>

                  <Button
                    variant={field.confirmed === 1 ? 'secondary' : 'primary'}
                    onClick={() => confirmField.mutate({ field: field.field_name, value })}
                  >
                    <Check className="size-4" />
                    {field.confirmed === 1 ? 'Re-confirm' : 'Confirm'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {fields.length > 0 && (
        <p className="mt-4 text-sm text-slate-500">
          Only confirmed fields are written to the matter. Anything below{' '}
          {Math.round(REVIEW_THRESHOLD * 100)}% confidence is highlighted for a closer look.
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  singular,
  value,
  tone,
}: {
  label: string;
  singular?: string;
  value: number;
  tone?: string;
}) {
  return (
    <Card className="p-4">
      <p className={`text-2xl font-bold ${tone ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-xs text-slate-500">{statLabel(value, label, singular)}</p>
    </Card>
  );
}
