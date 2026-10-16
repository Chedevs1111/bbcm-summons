import { FILING_ORDER, GENERATED_DOCUMENT_LABELS, type GeneratedDocumentType } from '@bbcm/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Files, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { count } from '../lib/format';
import type { GeneratedDocumentSummary } from '../lib/types';
import {
  Badge, Button, Card, Checkbox, EmptyState, ErrorNotice, PageHeader, Spinner,
} from '../components/ui';

export function Documents() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<GeneratedDocumentType[]>([
    'index_page', 'summons', 'particulars_of_claim', 'settlement_agreement', 'annexure_schedule',
  ]);
  const [error, setError] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['documents', id],
    queryFn: () => api.get<{ documents: GeneratedDocumentSummary[] }>(`/matters/${id}/documents`),
    enabled: Boolean(id),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<{ documents: GeneratedDocumentSummary[]; skipped: string[] }>(
        `/matters/${id}/documents/generate`,
        { document_types: selected },
      ),
    onSuccess: async (result) => {
      setError('');
      setSkipped(result.skipped);
      toast.success(`${count(result.documents.length, 'document')} generated`);
      await queryClient.invalidateQueries({ queryKey: ['documents', id] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Generation failed'),
  });

  const toggle = (type: GeneratedDocumentType) =>
    setSelected((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
    );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Documents"
        description="Generate court-ready pleadings from this matter."
        actions={
          <Link to={`/matters/${id}/annexures`}>
            <Button variant="secondary">Annexures</Button>
          </Link>
        }
      />

      <Card className="mb-6 p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Select documents to generate</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {FILING_ORDER.map((type) => (
            <Checkbox
              key={type}
              label={GENERATED_DOCUMENT_LABELS[type]}
              checked={selected.includes(type)}
              onChange={() => toggle(type)}
            />
          ))}
        </div>

        {error && <div className="mt-4"><ErrorNotice message={error} /></div>}

        {skipped.length > 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Skipped {skipped.map((t) => GENERATED_DOCUMENT_LABELS[t as GeneratedDocumentType] ?? t).join(', ')} —
            no template matches this matter's regime and contested status. Add one in the Template Designer.
          </p>
        )}

        <div className="mt-5">
          <Button
            disabled={selected.length === 0 || generate.isPending}
            onClick={() => generate.mutate()}
          >
            <Sparkles className="size-4" />
            {generate.isPending ? 'Generating…' : 'Generate documents'}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">
          Generated documents
        </h2>

        {isLoading && <Spinner />}

        {data?.documents.length === 0 && (
          <EmptyState
            icon={<Files className="size-10" />}
            title="Nothing generated yet"
            description="Choose the documents you need and generate them."
          />
        )}

        <ul className="divide-y divide-slate-100">
          {data?.documents.map((document) => (
            <li key={document.id}>
              <Link
                to={`/matters/${id}/documents/${document.id}`}
                className="flex items-center gap-3 p-4 transition hover:bg-slate-50"
              >
                <FileText className="size-5 shrink-0 text-gold-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{document.title}</p>
                  <p className="text-xs text-slate-500">{document.created_at}</p>
                </div>
                <Badge>v{document.version}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
