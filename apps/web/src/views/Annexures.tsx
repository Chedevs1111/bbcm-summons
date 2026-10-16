import { DOCUMENT_TYPE_LABELS } from '@bbcm/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, FileStack, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import type { MatterAttachment } from '../lib/types';
import { Button, Card, EmptyState, ErrorNotice, PageHeader, Spinner } from '../components/ui';

/** A–C are reserved for the marriage certificate, IDs and birth certificates. */
function labelFor(index: number): string {
  return String.fromCharCode(68 + index);
}

export function Annexures() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [order, setOrder] = useState<MatterAttachment[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['attachments', id],
    queryFn: () => api.get<{ attachments: MatterAttachment[] }>(`/matters/${id}/attachments`),
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (data) {
      setOrder(data.attachments);
      setDirty(false);
    }
  }, [data]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      api.post(`/matters/${id}/attachments/reorder`, { ids: order.map((a) => a.id) }),
    onSuccess: async () => {
      toast.success('Annexures renumbered');
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['attachments', id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save the order'),
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Annexure Manager"
        description="Annexures A–C are reserved for the marriage certificate, identity documents and birth certificates. Uploads are lettered from D."
        actions={
          <>
            <Link to={`/matters/${id}/documents`}>
              <Button variant="secondary">Documents</Button>
            </Link>
            <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              <Save className="size-4" />
              {save.isPending ? 'Saving…' : 'Save order'}
            </Button>
          </>
        }
      />

      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <Card>
        {order.length === 0 ? (
          <EmptyState
            icon={<FileStack className="size-10" />}
            title="No annexures attached"
            description="Upload documents to create annexures."
            action={
              <Link to={`/matters/${id}/upload`}>
                <Button>Upload documents</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-[4rem_1fr_auto] gap-3 border-b border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <span>Annexure</span>
              <span>Description</span>
              <span>Order</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {order.map((attachment, index) => (
                <li key={attachment.id} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3 px-4 py-3">
                  <span className="font-serif text-lg font-bold text-gold-600">
                    “{labelFor(index)}”
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {DOCUMENT_TYPE_LABELS[attachment.document_type]}
                    </p>
                    <p className="truncate text-xs text-slate-500">{attachment.file_name}</p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${attachment.file_name} up`}
                      className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === order.length - 1}
                      aria-label={`Move ${attachment.file_name} down`}
                      className="grid size-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
              Total annexures: <strong>{order.length}</strong>
              {dirty && <span className="ml-2 text-amber-700">— unsaved changes</span>}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
