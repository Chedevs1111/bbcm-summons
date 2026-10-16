/**
 * The client's view of their own matter.
 *
 * Rendered outside the authenticated shell: whoever opens this link is not a user of
 * the system, has no session, and must never see the firm's navigation, other matters
 * or anything privileged. The API decides what is visible; this page only displays it.
 */

import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType } from '@bbcm/schema';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, FileUp, ShieldCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { Button, Card, Field, Select, Spinner } from '../components/ui';

interface PortalView {
  matter: {
    reference: string;
    case_number: string;
    court: string;
    status: string;
    parties: string;
  };
  firm: { name: string; phone: string; email: string } | null;
  can_upload: boolean;
  outstanding: Array<{ type: string; label: string }>;
  uploads: Array<{ id: string; label: string; file_name: string; uploaded_at: string }>;
  service: { status: string; served_at: string } | null;
}

export function ClientPortal() {
  const { token } = useParams();
  const fileInput = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState<DocumentType>('marriage_certificate');
  const [uploading, setUploading] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portal', token],
    queryFn: () => api.get<PortalView>(`/portal/${token}`),
    enabled: Boolean(token),
  });

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        form.append('document_type', documentType);
        await api.upload(`/portal/${token}/uploads`, form);
      }
      toast.success('Thank you — your attorney has received it');
      await refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 px-4">
        <Card className="max-w-md p-8 text-center">
          <h1 className="mb-2 text-lg font-semibold text-slate-900">This link is not valid</h1>
          <p className="text-sm text-slate-600">
            It may have expired or been replaced. Please ask your attorney for a new link.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-navy-900 px-4 py-5">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-gold-500 font-serif text-lg font-bold text-white">
            BS
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-white">{data.firm?.name}</p>
            <p className="text-xs text-slate-300">Your matter</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        <Card className="mb-6 p-6">
          <h1 className="text-xl font-bold text-slate-900">{data.matter.parties}</h1>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Reference" value={data.matter.reference} />
            <Row label="Case number" value={data.matter.case_number} />
            <Row label="Court" value={data.matter.court} />
            <Row label="Status" value={data.matter.status} />
          </dl>
        </Card>

        {data.service && (
          <Card className="mb-6 flex items-start gap-3 p-4">
            <ShieldCheck
              className={`size-5 shrink-0 ${
                data.service.status === 'return_filed' ? 'text-emerald-600' : 'text-slate-400'
              }`}
            />
            <div className="text-sm">
              <p className="font-medium text-slate-900">
                {data.service.status === 'return_filed'
                  ? 'The summons has been served and the return filed'
                  : data.service.status === 'served'
                    ? 'The summons has been served'
                    : 'The summons is with the Sheriff for service'}
              </p>
              {data.service.served_at && (
                <p className="text-slate-500">Served on {data.service.served_at}</p>
              )}
            </div>
          </Card>
        )}

        <Card className="mb-6 p-6">
          <h2 className="mb-3 font-semibold text-slate-900">Documents still needed</h2>
          {data.outstanding.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="size-4" />
              Nothing outstanding — thank you.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.outstanding.map((item) => (
                <li key={item.type} className="flex items-center gap-2 text-sm text-slate-700">
                  <CircleDashed className="size-4 text-amber-500" />
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {data.can_upload && (
          <Card className="mb-6 p-6">
            <h2 className="mb-3 font-semibold text-slate-900">Send a document</h2>
            <Field label="What is this document?">
              <Select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
              >
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{DOCUMENT_TYPE_LABELS[type]}</option>
                ))}
              </Select>
            </Field>

            <label className="mt-3 flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 px-6 py-8 text-center transition hover:border-amber-400 hover:bg-amber-50/40">
              <FileUp className="size-7 text-slate-400" />
              <span className="text-sm font-medium text-slate-900">
                {uploading ? 'Sending…' : 'Tap to choose a file or take a photo'}
              </span>
              <span className="text-xs text-slate-500">JPEG, PNG or PDF · up to 15 MB</span>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                capture="environment"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => void upload(e.target.files)}
              />
            </label>
          </Card>
        )}

        {data.uploads.length > 0 && (
          <Card className="p-6">
            <h2 className="mb-3 font-semibold text-slate-900">What you have sent</h2>
            <ul className="divide-y divide-slate-100">
              {data.uploads.map((upload) => (
                <li key={upload.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-900">{upload.file_name}</span>
                  <span className="shrink-0 text-xs text-slate-500">{upload.label}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {data.firm && (
          <p className="mt-6 text-center text-xs text-slate-500">
            Questions? Contact {data.firm.name}
            {data.firm.phone && ` on ${data.firm.phone}`}
            {data.firm.email && ` or ${data.firm.email}`}.
          </p>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
