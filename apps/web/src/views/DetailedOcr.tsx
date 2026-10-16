import { DOCUMENT_TYPE_LABELS } from '@bbcm/schema';
import { useQuery } from '@tanstack/react-query';
import { ScanSearch } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { MatterAttachment, ReviewResponse } from '../lib/types';
import {
  Badge, Button, Card, ConfidenceBadge, EmptyState, PageHeader, Spinner,
} from '../components/ui';

/**
 * Raw transcription view: the text Claude read from each document, beside the
 * fields it derived. Used when a value looks wrong and the attorney wants to see
 * exactly what was on the page.
 */
export function DetailedOcr() {
  const { id } = useParams();
  const [selected, setSelected] = useState<string | null>(null);

  const attachments = useQuery({
    queryKey: ['attachments', id],
    queryFn: () => api.get<{ attachments: MatterAttachment[] }>(`/matters/${id}/attachments`),
    enabled: Boolean(id),
  });

  const review = useQuery({
    queryKey: ['review', id],
    queryFn: () => api.get<ReviewResponse>(`/matters/${id}/review`),
    enabled: Boolean(id),
  });

  const extracted = (attachments.data?.attachments ?? []).filter((a) => a.ocr_extracted === 1);
  const active = extracted.find((a) => a.id === selected) ?? extracted[0];
  const fieldsForActive = (review.data?.fields ?? []).filter(
    (field) => field.attachment_id === active?.id,
  );

  if (attachments.isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Detailed OCR"
        description="The raw text Claude read, beside the fields it derived from it."
        actions={
          <Link to={`/matters/${id}/review`}>
            <Button variant="secondary">Back to Review</Button>
          </Link>
        }
      />

      {extracted.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ScanSearch className="size-10" />}
            title="Nothing extracted yet"
            description="Run extraction on an uploaded document to see its transcription here."
            action={
              <Link to={`/matters/${id}/upload`}>
                <Button>Go to Upload &amp; Extract</Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <Card className="h-fit p-2">
            <ul className="space-y-1">
              {extracted.map((attachment) => (
                <li key={attachment.id}>
                  <button
                    onClick={() => setSelected(attachment.id)}
                    className={
                      attachment.id === active?.id
                        ? 'w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-sm font-medium text-amber-900'
                        : 'w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50'
                    }
                  >
                    <span className="block truncate">{attachment.file_name}</span>
                    <span className="text-xs text-slate-500">
                      {DOCUMENT_TYPE_LABELS[attachment.document_type]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <div className="space-y-6">
            {active && (
              <>
                <Card className="p-6">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-semibold text-slate-900">Fields from this document</h2>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Overall</span>
                      <ConfidenceBadge value={active.ocr_confidence} />
                    </span>
                  </div>

                  {fieldsForActive.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      No fields were mapped from this document.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {fieldsForActive.map((field) => (
                        <li key={field.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="font-mono text-xs text-slate-500">{field.field_name}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">{field.value}</span>
                            <ConfidenceBadge value={field.confidence} />
                            {field.overridden === 1 && <Badge tone="amber">Edited</Badge>}
                            {field.confirmed === 1 && <Badge tone="green">Confirmed</Badge>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="p-6">
                  <h2 className="mb-3 font-semibold text-slate-900">Raw transcription</h2>
                  <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
                    {active.ocr_text || 'No text was transcribed from this document.'}
                  </pre>
                </Card>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
