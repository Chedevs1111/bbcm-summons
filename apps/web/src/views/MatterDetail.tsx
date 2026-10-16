import { MARRIAGE_REGIME_LABELS, MATTER_STATUS_LABELS } from '@bbcm/schema';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, FileStack, FileText, Layers, ScanSearch, Upload } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { MatterDetailResponse } from '../lib/types';
import { Badge, Card, ErrorNotice, PageHeader, Spinner } from '../components/ui';

export function MatterDetail() {
  const { id } = useParams();

  const { data, isLoading, error } = useQuery({
    queryKey: ['matter', id],
    queryFn: () => api.get<MatterDetailResponse>(`/matters/${id}`),
    enabled: Boolean(id),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNotice message={(error as Error).message} />;
  if (!data) return null;

  const { matter, children, attachments, documents } = data;
  const title = `${matter.plaintiff_surname || 'Plaintiff'} v ${matter.defendant_surname || 'Defendant'}`;

  const steps = [
    { to: 'upload', label: 'Upload & Extract', icon: <Upload className="size-5" />, count: attachments.length },
    { to: 'review', label: 'Review & Confirm', icon: <FileText className="size-5" /> },
    { to: 'ocr', label: 'Detailed OCR', icon: <ScanSearch className="size-5" /> },
    { to: 'annexures', label: 'Annexures', icon: <FileStack className="size-5" />, count: attachments.length },
    { to: 'documents', label: 'Documents', icon: <FileText className="size-5" />, count: documents.length },
    { to: 'bundle', label: 'Court Bundle', icon: <Layers className="size-5" /> },
    { to: 'practice', label: 'Service & Fees', icon: <Briefcase className="size-5" /> },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={title}
        description={`${matter.case_reference || 'No reference'} · ${matter.court_name}`}
        actions={<Badge tone="blue">{MATTER_STATUS_LABELS[matter.status] ?? matter.status}</Badge>}
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step) => (
          <Link
            key={step.to}
            to={`/matters/${matter.id}/${step.to}`}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-gold-400 hover:shadow"
          >
            <div className="mb-2 text-gold-600">{step.icon}</div>
            <p className="text-sm font-semibold text-slate-900">{step.label}</p>
            {step.count !== undefined && (
              <p className="text-xs text-slate-500">{step.count} item{step.count === 1 ? '' : 's'}</p>
            )}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-4 font-semibold text-slate-900">Parties</h2>
          <div className="space-y-5">
            {(['plaintiff', 'defendant'] as const).map((side) => {
              const party = matter[side];
              return (
                <div key={side}>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{side}</p>
                  <p className="font-medium text-slate-900">
                    {party.full_names} {party.surname}
                  </p>
                  <dl className="mt-1 space-y-0.5 text-sm text-slate-600">
                    {party.id_number && <div>ID {party.id_number}</div>}
                    {party.occupation && <div>{party.occupation}</div>}
                    {party.physical_address && <div>{party.physical_address}</div>}
                  </dl>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 font-semibold text-slate-900">Marriage</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Date" value={matter.marriage_date} />
            <Row label="Place" value={matter.marriage_place} />
            <Row
              label="Regime"
              value={
                MARRIAGE_REGIME_LABELS[matter.marriage_regime as keyof typeof MARRIAGE_REGIME_LABELS] ??
                matter.marriage_regime
              }
            />
            <Row label="Contested" value={matter.is_contested ? 'Yes' : 'No'} />
            <Row label="Minor children" value={String(children.length)} />
            {matter.child_maintenance_claimed > 0 && (
              <Row label="Child maintenance" value={`R${matter.child_maintenance_claimed}/month`} />
            )}
            {matter.pension_interest_claimed === 1 && <Row label="Pension interest" value="Claimed" />}
            {matter.forfeiture_claimed === 1 && <Row label="Forfeiture" value="Claimed" />}
          </dl>
        </Card>

        {children.length > 0 && (
          <Card className="p-6 lg:col-span-2">
            <h2 className="mb-4 font-semibold text-slate-900">Minor children</h2>
            <ul className="divide-y divide-slate-100">
              {children.map((child) => (
                <li key={child.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium text-slate-900">
                    {child.full_name} {child.surname}
                  </span>
                  <span className="text-slate-500">
                    {child.dob}
                    {child.birth_cert_attached === 1 && ' · birth certificate attached'}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}
