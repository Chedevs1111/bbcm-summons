import {
  DEFAULT_VAT_RATE,
  formatRands,
  FEE_LINE_KINDS,
  FEE_LINE_KIND_LABELS,
  LEDGER_ACCOUNTS,
  SERVICE_MANNERS,
  SERVICE_MANNER_LABELS,
  SERVICE_STATUS_LABELS,
  type FeeLineKind,
  type LedgerAccount,
  type ServiceManner,
  type ServiceStatus,
} from '@bbcm/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Download, Link2, Plus, Receipt, ShieldCheck, Trash2, Truck } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError, downloadFile } from '../lib/api';
import { statLabel } from '../lib/format';
import {
  Badge, Button, Card, Checkbox, EmptyState, ErrorNotice, Field, Input, PageHeader, Select, Spinner,
} from '../components/ui';

type Tab = 'service' | 'fees' | 'access';

export function Practice() {
  const [tab, setTab] = useState<Tab>('service');

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'service', label: 'Sheriff Service', icon: <Truck className="size-4" /> },
    { id: 'fees', label: 'Fee Notes', icon: <Receipt className="size-4" /> },
    { id: 'access', label: 'Client Access', icon: <Link2 className="size-4" /> },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Practice"
        description="Service of process, billing and client access for this matter."
      />

      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((option) => (
          <button
            key={option.id}
            onClick={() => setTab(option.id)}
            className={
              tab === option.id
                ? '-mb-px flex items-center gap-2 border-b-2 border-gold-500 px-4 py-2 text-sm font-semibold text-gold-700'
                : '-mb-px flex items-center gap-2 border-b-2 border-transparent px-4 py-2 text-sm text-slate-600 hover:text-slate-900'
            }
          >
            {option.icon}
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'service' && <ServiceTab />}
      {tab === 'fees' && <FeeNotesTab />}
      {tab === 'access' && <AccessTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------

const STATUS_TONE: Record<ServiceStatus, 'slate' | 'blue' | 'amber' | 'green' | 'red'> = {
  instructed: 'blue',
  served: 'amber',
  not_served: 'red',
  return_filed: 'green',
};

interface ServiceEventRow {
  id: string;
  status: ServiceStatus;
  sheriff_office: string;
  sheriff_reference: string;
  service_address: string;
  manner: string;
  manner_detail: string;
  served_on: string;
  instructed_at: string;
  served_at: string;
  return_received_at: string;
  non_service_reason: string;
  fee: number;
}

function ServiceTab() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    sheriff_office: '',
    service_address: '',
    manner: 'personal' as ServiceManner,
    manner_detail: '',
    instructed_at: new Date().toISOString().slice(0, 10),
    fee: 0,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['service', id],
    queryFn: () =>
      api.get<{
        events: ServiceEventRow[];
        summary: { service_proved: boolean; awaiting_return: boolean; failed_attempts: number };
      }>(`/matters/${id}/service`),
    enabled: Boolean(id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['service', id] });

  const create = useMutation({
    mutationFn: () => api.post(`/matters/${id}/service`, form),
    onSuccess: async () => {
      toast.success('Instruction recorded');
      setShowForm(false);
      setError('');
      await refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save'),
  });

  const advance = useMutation({
    mutationFn: (payload: { eventId: string; body: Record<string, unknown> }) =>
      api.patch(`/matters/${id}/service/${payload.eventId}`, payload.body),
    onSuccess: async () => {
      setError('');
      await refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not update'),
  });

  if (isLoading) return <Spinner />;

  return (
    <>
      {data && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="mb-1 flex items-center gap-2">
              <ShieldCheck
                className={`size-5 ${data.summary.service_proved ? 'text-emerald-600' : 'text-slate-300'}`}
              />
              <p className="font-semibold text-slate-900">
                {data.summary.service_proved ? 'Proved' : 'Not proved'}
              </p>
            </div>
            <p className="text-xs text-slate-500">Service of process</p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold text-slate-900">{data.events.length}</p>
            <p className="text-xs text-slate-500">
              {statLabel(data.events.length, 'Attempts recorded', 'Attempt recorded')}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-2xl font-bold text-red-600">{data.summary.failed_attempts}</p>
            <p className="text-xs text-slate-500">Failed</p>
          </Card>
        </div>
      )}

      {!data?.summary.service_proved && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Default judgment cannot be sought until the Sheriff&rsquo;s return of service is filed.
        </div>
      )}

      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <Card className="mb-6">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-900">Service record</h2>
          <Button variant="secondary" onClick={() => setShowForm((open) => !open)}>
            <Plus className="size-4" /> Instruct Sheriff
          </Button>
        </div>

        {showForm && (
          <div className="border-b border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Sheriff's office">
                <Input
                  value={form.sheriff_office}
                  onChange={(e) => setForm({ ...form, sheriff_office: e.target.value })}
                  placeholder="Sheriff Pretoria East"
                />
              </Field>
              <Field label="Date instructed">
                <Input
                  type="date"
                  value={form.instructed_at}
                  onChange={(e) => setForm({ ...form, instructed_at: e.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Address for service">
                  <Input
                    value={form.service_address}
                    onChange={(e) => setForm({ ...form, service_address: e.target.value })}
                    placeholder="12 Protea Road, Centurion"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Manner of service" hint="Uniform Rule 4(1)(a)">
                  <Select
                    value={form.manner}
                    onChange={(e) => setForm({ ...form, manner: e.target.value as ServiceManner })}
                  >
                    {SERVICE_MANNERS.map((manner) => (
                      <option key={manner} value={manner}>{SERVICE_MANNER_LABELS[manner]}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              {form.manner === 'other' && (
                <div className="sm:col-span-2">
                  <Field label="Describe the manner of service">
                    <Input
                      value={form.manner_detail}
                      onChange={(e) => setForm({ ...form, manner_detail: e.target.value })}
                    />
                  </Field>
                </div>
              )}
              <Field label="Sheriff's fee (R)">
                <Input
                  type="number"
                  min={0}
                  value={form.fee}
                  onChange={(e) => setForm({ ...form, fee: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="mt-3">
              <Button disabled={create.isPending} onClick={() => create.mutate()}>
                Record instruction
              </Button>
            </div>
          </div>
        )}

        {data?.events.length === 0 && (
          <EmptyState
            icon={<Truck className="size-10" />}
            title="No service recorded"
            description="Record the instruction to the Sheriff once the summons has been issued."
          />
        )}

        <ul className="divide-y divide-slate-100">
          {data?.events.map((event) => (
            <li key={event.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[event.status]}>
                  {SERVICE_STATUS_LABELS[event.status]}
                </Badge>
                <span className="font-medium text-slate-900">
                  {event.sheriff_office || 'Sheriff'}
                </span>
                {event.fee > 0 && (
                  <span className="text-xs text-slate-500">{formatRands(event.fee)}</span>
                )}
              </div>

              <dl className="space-y-0.5 text-sm text-slate-600">
                {event.service_address && <div>{event.service_address}</div>}
                {event.manner && (
                  <div>
                    {SERVICE_MANNER_LABELS[event.manner as ServiceManner] ?? event.manner}
                    {event.manner_detail && ` — ${event.manner_detail}`}
                  </div>
                )}
                {event.served_on && <div>Served on: {event.served_on}</div>}
                {event.served_at && <div>Served: {event.served_at}</div>}
                {event.return_received_at && <div>Return received: {event.return_received_at}</div>}
                {event.non_service_reason && (
                  <div className="text-red-700">Not served: {event.non_service_reason}</div>
                )}
              </dl>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadFile(
                      `/matters/${id}/service/${event.id}/instruction`,
                      'Instruction to Sheriff.pdf',
                    ).catch(() => toast.error('Could not build the letter'))
                  }
                >
                  <Download className="size-4" /> Instruction letter
                </Button>

                {event.status === 'instructed' && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const date = window.prompt('Date service was effected (YYYY-MM-DD)');
                        if (!date) return;
                        const on = window.prompt('Served on whom, and in what capacity?') ?? '';
                        advance.mutate({
                          eventId: event.id,
                          body: { status: 'served', served_at: date, served_on: on },
                        });
                      }}
                    >
                      <Check className="size-4" /> Mark served
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const reason = window.prompt('Why could service not be effected?');
                        if (!reason) return;
                        advance.mutate({
                          eventId: event.id,
                          body: { status: 'not_served', non_service_reason: reason },
                        });
                      }}
                    >
                      Not served
                    </Button>
                  </>
                )}

                {event.status === 'served' && (
                  <Button
                    onClick={() => {
                      const date = window.prompt('Date the return of service was received (YYYY-MM-DD)');
                      if (!date) return;
                      advance.mutate({
                        eventId: event.id,
                        body: { status: 'return_filed', return_received_at: date },
                      });
                    }}
                  >
                    File return of service
                  </Button>
                )}

                {event.status === 'not_served' && (
                  <Button
                    variant="secondary"
                    onClick={() => advance.mutate({ eventId: event.id, body: { status: 'instructed' } })}
                  >
                    Re-instruct
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------

interface FeeNoteRow {
  id: string;
  note_number: string;
  status: string;
  issued_at: string;
  lines: Array<{
    id: string;
    description: string;
    kind: FeeLineKind;
    account: LedgerAccount;
    quantity: number;
    unit_amount: number;
    vatable: number;
  }>;
  totals: {
    fees: number;
    disbursements: number;
    business: number;
    trust: number;
    vat: number;
    total: number;
  };
}

// Same formatter the PDFs use, so screen and document always agree.
const rands = formatRands;

function FeeNotesTab() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [lines, setLines] = useState([
    { description: '', kind: 'fee' as FeeLineKind, account: 'business' as LedgerAccount, quantity: 1, unit_amount: 0, vatable: true },
  ]);

  const { data, isLoading } = useQuery({
    queryKey: ['fee-notes', id],
    queryFn: () =>
      api.get<{
        fee_notes: FeeNoteRow[];
        summary: { billed: number; outstanding: number; trust_held: number };
      }>(`/matters/${id}/fee-notes`),
    enabled: Boolean(id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['fee-notes', id] });

  const create = useMutation({
    mutationFn: () => api.post(`/matters/${id}/fee-notes`, { lines, vat_rate: DEFAULT_VAT_RATE }),
    onSuccess: async () => {
      toast.success('Fee note drafted');
      setLines([{ description: '', kind: 'fee', account: 'business', quantity: 1, unit_amount: 0, vatable: true }]);
      setError('');
      await refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save'),
  });

  const issue = useMutation({
    mutationFn: (noteId: string) =>
      api.patch(`/matters/${id}/fee-notes/${noteId}`, { status: 'issued' }),
    onSuccess: async () => {
      toast.success('Fee note issued');
      await refresh();
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <>
      {data && (
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Card className="p-4">
            <p className="text-xl font-bold text-slate-900">{rands(data.summary.billed)}</p>
            <p className="text-xs text-slate-500">Billed</p>
          </Card>
          <Card className="p-4">
            <p className="text-xl font-bold text-amber-600">{rands(data.summary.outstanding)}</p>
            <p className="text-xs text-slate-500">Outstanding</p>
          </Card>
          <Card className="p-4">
            <p className="text-xl font-bold text-blue-600">{rands(data.summary.trust_held)}</p>
            <p className="text-xs text-slate-500">Trust ledger</p>
          </Card>
        </div>
      )}

      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <Card className="mb-6 p-4">
        <h2 className="mb-3 font-semibold text-slate-900">New fee note</h2>

        <div className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <Input
                  value={line.description}
                  placeholder="Description"
                  onChange={(e) =>
                    setLines(lines.map((l, i) => (i === index ? { ...l, description: e.target.value } : l)))
                  }
                />
              </div>
              <div className="sm:col-span-3">
                <Select
                  value={line.kind}
                  onChange={(e) => {
                    const kind = e.target.value as FeeLineKind;
                    // A disbursement is money laid out for the client, so it belongs
                    // in the trust ledger by default.
                    setLines(
                      lines.map((l, i) =>
                        i === index
                          ? { ...l, kind, account: kind === 'disbursement' ? 'trust' : 'business', vatable: kind !== 'disbursement' }
                          : l,
                      ),
                    );
                  }}
                >
                  {FEE_LINE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{FEE_LINE_KIND_LABELS[kind]}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Select
                  value={line.account}
                  onChange={(e) =>
                    setLines(lines.map((l, i) => (i === index ? { ...l, account: e.target.value as LedgerAccount } : l)))
                  }
                >
                  {LEDGER_ACCOUNTS.map((account) => (
                    <option key={account} value={account}>{account}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-1">
                <Input
                  type="number"
                  min={0}
                  step="0.5"
                  value={line.quantity}
                  onChange={(e) =>
                    setLines(lines.map((l, i) => (i === index ? { ...l, quantity: Number(e.target.value) } : l)))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  type="number"
                  min={0}
                  value={line.unit_amount}
                  placeholder="Amount"
                  onChange={(e) =>
                    setLines(lines.map((l, i) => (i === index ? { ...l, unit_amount: Number(e.target.value) } : l)))
                  }
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={() =>
              setLines([...lines, { description: '', kind: 'fee', account: 'business', quantity: 1, unit_amount: 0, vatable: true }])
            }
          >
            <Plus className="size-4" /> Add line
          </Button>
          <Button
            disabled={create.isPending || lines.every((l) => !l.description.trim())}
            onClick={() => create.mutate()}
          >
            Draft fee note
          </Button>
          <span className="text-xs text-slate-500">VAT at {DEFAULT_VAT_RATE}% on vatable lines</span>
        </div>
      </Card>

      <Card>
        <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">Fee notes</h2>

        {data?.fee_notes.length === 0 && (
          <EmptyState
            icon={<Receipt className="size-10" />}
            title="No fee notes yet"
            description="Draft a fee note for the work done on this matter."
          />
        )}

        <ul className="divide-y divide-slate-100">
          {data?.fee_notes.map((note) => (
            <li key={note.id} className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-medium text-slate-900">{note.note_number}</span>
                <Badge tone={note.status === 'paid' ? 'green' : note.status === 'issued' ? 'amber' : 'slate'}>
                  {note.status}
                </Badge>
                {note.issued_at && <span className="text-xs text-slate-500">{note.issued_at}</span>}
                <span className="ml-auto font-semibold text-slate-900">{rands(note.totals.total)}</span>
              </div>

              <ul className="mb-2 space-y-0.5 text-sm text-slate-600">
                {note.lines.map((line) => (
                  <li key={line.id} className="flex justify-between gap-4">
                    <span className="truncate">
                      {line.description}
                      <span className="ml-2 text-xs text-slate-400">{line.account}</span>
                    </span>
                    <span className="tabular-nums">{rands(line.quantity * line.unit_amount)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>Fees {rands(note.totals.fees)}</span>
                <span>Disbursements {rands(note.totals.disbursements)}</span>
                <span>VAT {rands(note.totals.vat)}</span>
                <span className="text-blue-700">Trust {rands(note.totals.trust)}</span>
                <Button
                  variant="secondary"
                  className="ml-auto"
                  onClick={() =>
                    downloadFile(
                      `/matters/${id}/fee-notes/${note.id}/pdf`,
                      `${note.note_number}.pdf`,
                    ).catch(() => toast.error('Could not build the fee note'))
                  }
                >
                  <Download className="size-4" /> PDF
                </Button>
                {note.status === 'draft' && (
                  <Button onClick={() => issue.mutate(note.id)}>Issue</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------

interface InviteRow {
  id: string;
  party: string;
  label: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  use_count: number;
  can_upload: number;
}

function AccessTab() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [issued, setIssued] = useState<{ token: string; path: string } | null>(null);
  const [party, setParty] = useState<'plaintiff' | 'defendant'>('plaintiff');
  const [label, setLabel] = useState('');
  const [canUpload, setCanUpload] = useState(true);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['portal-invites', id],
    queryFn: () => api.get<{ invites: InviteRow[] }>(`/matters/${id}/portal-invites`),
    enabled: Boolean(id),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['portal-invites', id] });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ token: string; path: string }>(`/matters/${id}/portal-invites`, {
        party,
        label,
        can_upload: canUpload,
      }),
    onSuccess: async (result) => {
      setIssued(result);
      setError('');
      await refresh();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create the link'),
  });

  const revoke = useMutation({
    mutationFn: (inviteId: string) => api.delete(`/matters/${id}/portal-invites/${inviteId}`),
    onSuccess: async () => {
      toast.success('Link revoked');
      await refresh();
    },
  });

  if (isLoading) return <Spinner />;

  const fullLink = issued ? `${window.location.origin}${issued.path}` : '';

  return (
    <>
      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      {issued && (
        <Card className="mb-6 border-emerald-300 bg-emerald-50 p-4">
          <p className="mb-2 text-sm font-semibold text-emerald-900">
            Link created. Copy it now — it is not shown again.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-emerald-200 bg-white px-3 py-2 text-xs">
              {fullLink}
            </code>
            <Button
              variant="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(fullLink);
                toast.success('Link copied');
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
          </div>
          <p className="mt-2 text-xs text-emerald-800">
            Send it to your client through the channel you already use with them. Nothing here
            stores the link, so it cannot be recovered later.
          </p>
        </Card>
      )}

      <Card className="mb-6 p-4">
        <h2 className="mb-3 font-semibold text-slate-900">New client link</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Party">
            <Select value={party} onChange={(e) => setParty(e.target.value as typeof party)}>
              <option value="plaintiff">Plaintiff</option>
              <option value="defendant">Defendant</option>
            </Select>
          </Field>
          <Field label="Label" hint="For your own reference">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Mrs Mokoena" />
          </Field>
          <div className="sm:col-span-2">
            <Checkbox
              label="Allow the client to upload documents"
              hint="Off makes the link read-only"
              checked={canUpload}
              onChange={(e) => setCanUpload(e.target.checked)}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button disabled={create.isPending} onClick={() => create.mutate()}>
            <Link2 className="size-4" /> Create link
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">Active links</h2>

        {data?.invites.length === 0 && (
          <EmptyState
            icon={<Link2 className="size-10" />}
            title="No client links"
            description="Create a link so your client can check progress without phoning."
          />
        )}

        <ul className="divide-y divide-slate-100">
          {data?.invites.map((invite) => {
            const expired = new Date(invite.expires_at).getTime() < Date.now();
            return (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {invite.label || invite.party}
                    <span className="ml-2 text-xs font-normal text-slate-500">{invite.party}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Expires {invite.expires_at.slice(0, 10)} · opened {invite.use_count}×
                    {invite.last_used_at && ` · last ${invite.last_used_at}`}
                  </p>
                </div>
                {invite.revoked_at ? (
                  <Badge tone="red">revoked</Badge>
                ) : expired ? (
                  <Badge tone="slate">expired</Badge>
                ) : (
                  <>
                    <Badge tone={invite.can_upload ? 'green' : 'blue'}>
                      {invite.can_upload ? 'can upload' : 'read only'}
                    </Badge>
                    <button
                      onClick={() => revoke.mutate(invite.id)}
                      aria-label="Revoke link"
                      className="grid size-9 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
