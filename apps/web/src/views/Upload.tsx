import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType } from '@bbcm/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileUp, Sparkles, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { count } from '../lib/format';
import type { ExtractionResponse, MatterAttachment } from '../lib/types';
import {
  Badge, Button, Card, ConfidenceBadge, EmptyState, ErrorNotice, Field, PageHeader, Select, Spinner,
} from '../components/ui';

export function Upload() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [documentType, setDocumentType] = useState<DocumentType>('marriage_certificate');
  const [party, setParty] = useState<'' | 'plaintiff' | 'defendant'>('');
  const [uploading, setUploading] = useState(false);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [lastExtraction, setLastExtraction] = useState<ExtractionResponse | null>(null);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['attachments', id],
    queryFn: () => api.get<{ attachments: MatterAttachment[] }>(`/matters/${id}/attachments`),
    enabled: Boolean(id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['attachments', id] });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('document_type', documentType);
        await api.upload(`/matters/${id}/attachments`, form);
      }
      toast.success(`${count(files.length, 'document')} uploaded`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const extract = useMutation({
    mutationFn: (attachmentId: string) => {
      setExtractingId(attachmentId);
      const query = party ? `?party=${party}` : '';
      return api.post<ExtractionResponse>(
        `/matters/${id}/attachments/${attachmentId}/extract${query}`,
      );
    },
    onSuccess: async (result) => {
      setLastExtraction(result);
      toast.success(`${count(result.applied_fields.length, 'field')} extracted`);
      await refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Extraction failed'),
    onSettled: () => setExtractingId(null),
  });

  const remove = useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete(`/matters/${id}/attachments/${attachmentId}`),
    onSuccess: async () => {
      toast.success('Document removed');
      await refresh();
    },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Upload & Extract"
        description="Upload your documents or take photos. Claude reads them and fills the matter in."
        actions={
          <Link to={`/matters/${id}/review`}>
            <Button variant="secondary">Go to Review</Button>
          </Link>
        }
      />

      <Card className="mb-6 p-6">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Field label="Document type">
            <Select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as DocumentType)}
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>
              ))}
            </Select>
          </Field>
          <Field
            label="Belongs to"
            hint="Needed for IDs and payslips so fields land on the right party"
          >
            <Select value={party} onChange={(e) => setParty(e.target.value as typeof party)}>
              <option value="">Not party-specific</option>
              <option value="plaintiff">Plaintiff</option>
              <option value="defendant">Defendant</option>
            </Select>
          </Field>
        </div>

        <label
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-10 text-center transition hover:border-amber-400 hover:bg-amber-50/40"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void upload(e.dataTransfer.files);
          }}
        >
          <FileUp className="size-8 text-slate-400" />
          <span className="font-medium text-slate-900">
            {uploading ? 'Uploading…' : 'Drop files here or click to browse'}
          </span>
          <span className="text-xs text-slate-500">
            JPEG, PNG, WebP or PDF · up to 25 MB each · camera capture supported on mobile
          </span>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => void upload(e.target.files)}
          />
        </label>

        {error && <div className="mt-4"><ErrorNotice message={error} /></div>}
      </Card>

      {lastExtraction && (
        <Card className="mb-6 p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Extraction complete</h2>
            <ConfidenceBadge value={lastExtraction.extraction.overall_confidence} />
          </div>
          {!lastExtraction.extraction.legible && (
            <div className="mb-3">
              <ErrorNotice message="Claude reported this document is hard to read. Check every field before generating." />
            </div>
          )}
          {lastExtraction.extraction.notes && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {lastExtraction.extraction.notes}
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {lastExtraction.applied_fields.map((field) => (
              <li key={field.field} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-slate-500">{field.field}</span>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{field.value}</span>
                  <ConfidenceBadge value={field.confidence} />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Link to={`/matters/${id}/review`}>
              <Button>Review &amp; confirm these fields</Button>
            </Link>
          </div>
        </Card>
      )}

      <Card>
        <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">
          Uploaded documents
        </h2>

        {isLoading && <Spinner />}

        {data?.attachments.length === 0 && (
          <EmptyState
            icon={<FileUp className="size-10" />}
            title="No documents yet"
            description="Upload the marriage certificate and identity documents to begin."
          />
        )}

        <ul className="divide-y divide-slate-100">
          {data?.attachments.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{attachment.file_name}</p>
                <p className="text-xs text-slate-500">
                  {DOCUMENT_TYPE_LABELS[attachment.document_type]} · Annexure “
                  {attachment.annexure_label}” · {Math.round(attachment.size_bytes / 1024)} KB
                </p>
              </div>

              {attachment.ocr_extracted === 1 ? (
                <span className="flex items-center gap-1.5 text-sm text-emerald-700">
                  <CheckCircle2 className="size-4" />
                  <ConfidenceBadge value={attachment.ocr_confidence} />
                </span>
              ) : (
                <Badge>Not extracted</Badge>
              )}

              <Button
                variant="secondary"
                disabled={extractingId === attachment.id}
                onClick={() => extract.mutate(attachment.id)}
              >
                <Sparkles className="size-4" />
                {extractingId === attachment.id ? 'Extracting…' : 'Extract'}
              </Button>

              <button
                onClick={() => remove.mutate(attachment.id)}
                aria-label={`Delete ${attachment.file_name}`}
                className="grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
