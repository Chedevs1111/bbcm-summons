import {
  MARRIAGE_REGIMES,
  MARRIAGE_REGIME_LABELS,
  MARRIAGE_TYPES,
  MARRIAGE_TYPE_LABELS,
  isValidSaIdNumber,
  parseSaIdNumber,
} from '@bbcm/schema';
import { useQuery } from '@tanstack/react-query';
import { Building2, Check, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { emptyParty, type Party } from '../lib/types';
import {
  Button, Card, Checkbox, ErrorNotice, Field, Input, PageHeader, Select, Spinner,
} from '../components/ui';

const STEPS = ['Court', 'Parties', 'Marriage', 'Review'] as const;

interface Lookups {
  firm: { id: string; name: string } | null;
  branches: Array<{ id: string; name: string }>;
  attorneys: Array<{ id: string; full_name: string; role: string }>;
  provinces: string[];
  courts: Record<string, Record<string, string[]>>;
}

interface ChildRow {
  full_name: string;
  surname: string;
  id_number: string;
  dob: string;
  gender: string;
  birth_cert_attached: boolean;
  maintenance_claimed: number;
}

export function NewMatter() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const { data: lookups, isLoading } = useQuery({
    queryKey: ['lookups'],
    queryFn: () => api.get<Lookups>('/lookups'),
  });

  // Step 1 — court
  const [branchId, setBranchId] = useState('');
  const [attorneyId, setAttorneyId] = useState('');
  const [caseReference, setCaseReference] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [province, setProvince] = useState('');
  const [courtType, setCourtType] = useState<'high_court' | 'regional_court'>('high_court');
  const [courtName, setCourtName] = useState('');
  const [isContested, setIsContested] = useState(false);

  // Step 2 — parties
  const [plaintiff, setPlaintiff] = useState<Party>({ ...emptyParty });
  const [defendant, setDefendant] = useState<Party>({ ...emptyParty });

  // Step 3 — marriage
  const [marriageDate, setMarriageDate] = useState('');
  const [marriagePlace, setMarriagePlace] = useState('');
  const [marriageType, setMarriageType] = useState('civil');
  const [marriageRegime, setMarriageRegime] = useState('in_community');
  const [certificateAttached, setCertificateAttached] = useState(false);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [childMaintenance, setChildMaintenance] = useState(0);
  const [spousalMaintenance, setSpousalMaintenance] = useState(0);
  const [pensionClaimed, setPensionClaimed] = useState(false);
  const [forfeitureClaimed, setForfeitureClaimed] = useState(false);
  const [costsSought, setCostsSought] = useState(false);

  const availableCourts = useMemo(() => {
    if (!lookups || !province) return [];
    return lookups.courts[courtType]?.[province] ?? [];
  }, [lookups, province, courtType]);

  const stepErrors = useMemo(() => {
    const errors: string[] = [];
    if (step === 0) {
      if (!attorneyId) errors.push('Select the attorney handling the matter.');
      if (!province) errors.push('Select a province.');
      if (!courtName) errors.push('Select a court division.');
    }
    if (step === 1) {
      for (const [label, party] of [['Plaintiff', plaintiff], ['Defendant', defendant]] as const) {
        if (!party.full_names.trim()) errors.push(`${label}: full names are required.`);
        if (!party.surname.trim()) errors.push(`${label}: surname is required.`);
        if (!party.physical_address.trim()) errors.push(`${label}: physical address is required.`);
        if (party.id_number && !isValidSaIdNumber(party.id_number)) {
          errors.push(`${label}: that ID number fails the checksum.`);
        }
      }
    }
    if (step === 2) {
      if (!marriageDate) errors.push('Marriage date is required.');
      if (!marriagePlace.trim()) errors.push('Place of marriage is required.');
    }
    return errors;
  }, [step, attorneyId, province, courtName, plaintiff, defendant, marriageDate, marriagePlace]);

  const submit = async () => {
    setSubmitting(true);
    setFormError('');
    try {
      const response = await api.post<{ matter: { id: string } }>('/matters', {
        branch_id: branchId || null,
        attorney_id: attorneyId,
        case_reference: caseReference,
        case_number: caseNumber,
        province,
        court_type: courtType,
        court_name: courtName,
        is_contested: isContested,
        marriage_date: marriageDate,
        marriage_place: marriagePlace,
        marriage_type: marriageType,
        marriage_regime: marriageRegime,
        marriage_certificate_attached: certificateAttached,
        child_maintenance_claimed: childMaintenance,
        spousal_maintenance_claimed: spousalMaintenance,
        pension_interest_claimed: pensionClaimed,
        forfeiture_claimed: forfeitureClaimed,
        costs_sought: costsSought,
        status: 'active',
        plaintiff,
        defendant,
        children,
      });
      toast.success('Matter created');
      navigate(`/matters/${response.matter.id}`);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Could not create the matter');
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <Spinner label="Loading firm details…" />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="New Divorce Matter" description="Follow the steps below to create a new matter." />

      <ol className="mb-6 flex flex-wrap items-center gap-2">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => index < step && setStep(index)}
              disabled={index > step}
              className={
                index === step
                  ? 'flex items-center gap-2 rounded-lg bg-gold-500 px-3 py-1.5 text-sm font-semibold text-white'
                  : index < step
                    ? 'flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-200'
                    : 'flex cursor-not-allowed items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-slate-400'
              }
            >
              <span className="grid size-5 place-items-center rounded-full bg-white/25 text-xs font-bold">
                {index < step ? <Check className="size-3" /> : index + 1}
              </span>
              {label}
            </button>
            {index < STEPS.length - 1 && <span className="h-px w-6 bg-slate-200" />}
          </li>
        ))}
      </ol>

      <Card className="p-6">
        {step === 0 && (
          <section>
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
              <Building2 className="size-5 text-gold-500" /> Firm &amp; Court
            </h2>
            <p className="mb-5 text-sm text-slate-500">
              {lookups?.firm?.name} — select the attorney and the court where the action will be filed.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Branch">
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Select…</option>
                  {lookups?.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Attorney" required>
                <Select value={attorneyId} onChange={(e) => setAttorneyId(e.target.value)}>
                  <option value="">Select…</option>
                  {lookups?.attorneys.map((attorney) => (
                    <option key={attorney.id} value={attorney.id}>{attorney.full_name}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Case Reference" hint="Your firm's internal reference number">
                <Input
                  value={caseReference}
                  onChange={(e) => setCaseReference(e.target.value)}
                  placeholder="e.g. VDM/2026/D/005"
                />
              </Field>

              <Field label="Case Number" hint="Leave blank until the registrar allocates one">
                <Input
                  value={caseNumber}
                  onChange={(e) => setCaseNumber(e.target.value)}
                  placeholder="e.g. 12345/2026"
                />
              </Field>

              <Field label="Province" required>
                <Select
                  value={province}
                  onChange={(e) => { setProvince(e.target.value); setCourtName(''); }}
                >
                  <option value="">Select…</option>
                  {lookups?.provinces.map((p) => <option key={p} value={p}>{p}</option>)}
                </Select>
              </Field>

              <Field label="Court Type" required>
                <Select
                  value={courtType}
                  onChange={(e) => {
                    setCourtType(e.target.value as 'high_court' | 'regional_court');
                    setCourtName('');
                  }}
                >
                  <option value="high_court">High Court</option>
                  <option value="regional_court">Regional Court</option>
                </Select>
              </Field>

              <div className="sm:col-span-2">
                <Field label="Court Division" required>
                  <Select
                    value={courtName}
                    onChange={(e) => setCourtName(e.target.value)}
                    disabled={!province}
                  >
                    <option value="">{province ? 'Select…' : 'Choose a province first'}</option>
                    {availableCourts.map((court) => (
                      <option key={court} value={court}>{court}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="sm:col-span-2">
                <Checkbox
                  label="Contested divorce"
                  hint="Is this a contested matter? If unsure, leave off."
                  checked={isContested}
                  onChange={(e) => setIsContested(e.target.checked)}
                />
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section>
            <h2 className="mb-1 flex items-center gap-2 font-semibold text-slate-900">
              <Users className="size-5 text-gold-500" /> Parties
            </h2>
            <p className="mb-5 text-sm text-slate-500">
              You can leave financial details blank now and extract them from uploaded documents later.
            </p>
            <div className="space-y-8">
              <PartyForm label="Plaintiff" party={plaintiff} onChange={setPlaintiff} />
              <PartyForm label="Defendant" party={defendant} onChange={setDefendant} />
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 className="mb-5 font-semibold text-slate-900">Marriage &amp; Consequences</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Marriage Date" required>
                <Input type="date" value={marriageDate} onChange={(e) => setMarriageDate(e.target.value)} />
              </Field>
              <Field label="Place of Marriage" required>
                <Input
                  value={marriagePlace}
                  onChange={(e) => setMarriagePlace(e.target.value)}
                  placeholder="e.g. Pretoria"
                />
              </Field>
              <Field label="Marriage Type">
                <Select value={marriageType} onChange={(e) => setMarriageType(e.target.value)}>
                  {MARRIAGE_TYPES.map((type) => (
                    <option key={type} value={type}>{MARRIAGE_TYPE_LABELS[type]}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Matrimonial Property Regime">
                <Select value={marriageRegime} onChange={(e) => setMarriageRegime(e.target.value)}>
                  {MARRIAGE_REGIMES.map((regime) => (
                    <option key={regime} value={regime}>{MARRIAGE_REGIME_LABELS[regime]}</option>
                  ))}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Checkbox
                  label="Marriage certificate attached"
                  hint="Filed as Annexure “A”"
                  checked={certificateAttached}
                  onChange={(e) => setCertificateAttached(e.target.checked)}
                />
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-medium text-slate-900">Minor children</h3>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() =>
                    setChildren((rows) => [
                      ...rows,
                      {
                        full_name: '', surname: plaintiff.surname, id_number: '', dob: '',
                        gender: '', birth_cert_attached: false, maintenance_claimed: 0,
                      },
                    ])
                  }
                >
                  <Plus className="size-4" /> Add child
                </Button>
              </div>

              {children.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
                  No minor children of the marriage.
                </p>
              )}

              <div className="space-y-3">
                {children.map((child, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 p-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field label="Full name">
                        <Input
                          value={child.full_name}
                          onChange={(e) => updateChild(setChildren, index, { full_name: e.target.value })}
                        />
                      </Field>
                      <Field label="Surname">
                        <Input
                          value={child.surname}
                          onChange={(e) => updateChild(setChildren, index, { surname: e.target.value })}
                        />
                      </Field>
                      <Field label="Date of birth">
                        <Input
                          type="date"
                          value={child.dob}
                          onChange={(e) => updateChild(setChildren, index, { dob: e.target.value })}
                        />
                      </Field>
                      <Field label="ID number">
                        <Input
                          value={child.id_number}
                          onChange={(e) => updateChild(setChildren, index, { id_number: e.target.value })}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <Checkbox
                        label="Birth certificate attached"
                        checked={child.birth_cert_attached}
                        onChange={(e) =>
                          updateChild(setChildren, index, { birth_cert_attached: e.target.checked })
                        }
                      />
                      <button
                        type="button"
                        onClick={() => setChildren((rows) => rows.filter((_, i) => i !== index))}
                        className="inline-flex items-center gap-1 text-sm text-red-600 hover:underline"
                      >
                        <Trash2 className="size-4" /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <h3 className="mb-3 font-medium text-slate-900">Relief claimed</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Child maintenance per child (R/month)">
                  <Input
                    type="number"
                    min={0}
                    value={childMaintenance}
                    onChange={(e) => setChildMaintenance(Number(e.target.value))}
                  />
                </Field>
                <Field label="Spousal maintenance (R/month)">
                  <Input
                    type="number"
                    min={0}
                    value={spousalMaintenance}
                    onChange={(e) => setSpousalMaintenance(Number(e.target.value))}
                  />
                </Field>
                <div className="space-y-3 sm:col-span-2">
                  <Checkbox
                    label="Pension interest claimed"
                    hint="Section 7(7)(a) of the Divorce Act 70 of 1979"
                    checked={pensionClaimed}
                    onChange={(e) => setPensionClaimed(e.target.checked)}
                  />
                  <Checkbox
                    label="Forfeiture of benefits claimed"
                    hint="Section 9(1) of the Divorce Act 70 of 1979"
                    checked={forfeitureClaimed}
                    onChange={(e) => setForfeitureClaimed(e.target.checked)}
                  />
                  <Checkbox
                    label="Costs sought"
                    checked={costsSought}
                    onChange={(e) => setCostsSought(e.target.checked)}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 className="mb-5 font-semibold text-slate-900">Review &amp; Create</h2>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Summary label="Court" value={courtName} />
              <Summary label="Province" value={province} />
              <Summary label="Reference" value={caseReference || '—'} />
              <Summary label="Contested" value={isContested ? 'Yes' : 'No'} />
              <Summary
                label="Plaintiff"
                value={`${plaintiff.full_names} ${plaintiff.surname}`.trim()}
              />
              <Summary
                label="Defendant"
                value={`${defendant.full_names} ${defendant.surname}`.trim()}
              />
              <Summary label="Married on" value={marriageDate} />
              <Summary label="At" value={marriagePlace} />
              <Summary
                label="Regime"
                value={MARRIAGE_REGIME_LABELS[marriageRegime as keyof typeof MARRIAGE_REGIME_LABELS]}
              />
              <Summary label="Minor children" value={String(children.length)} />
            </dl>
            {formError && <div className="mt-5"><ErrorNotice message={formError} /></div>}
          </section>
        )}

        {stepErrors.length > 0 && step < 3 && (
          <ul className="mt-6 space-y-1 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {stepErrors.map((message) => <li key={message}>• {message}</li>)}
          </ul>
        )}

        <div className="mt-8 flex justify-between border-t border-slate-200 pt-5">
          <Button
            variant="secondary"
            type="button"
            onClick={() => (step === 0 ? navigate('/') : setStep(step - 1))}
          >
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button type="button" disabled={stepErrors.length > 0} onClick={() => setStep(step + 1)}>
              Next
            </Button>
          ) : (
            <Button type="button" disabled={submitting} onClick={submit}>
              {submitting ? 'Creating…' : 'Create Matter'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function updateChild(
  setChildren: React.Dispatch<React.SetStateAction<ChildRow[]>>,
  index: number,
  patch: Partial<ChildRow>,
) {
  setChildren((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}

function PartyForm({
  label,
  party,
  onChange,
}: {
  label: string;
  party: Party;
  onChange: (party: Party) => void;
}) {
  const set = (patch: Partial<Party>) => onChange({ ...party, ...patch });

  // A valid SA ID number encodes date of birth and gender — fill them in automatically.
  const onIdChange = (value: string) => {
    const derived = parseSaIdNumber(value);
    set(derived ? { id_number: value, dob: derived.dob, gender: derived.gender } : { id_number: value });
  };

  const idInvalid = party.id_number.length > 0 && !isValidSaIdNumber(party.id_number);

  return (
    <fieldset>
      <legend className="mb-3 font-medium text-slate-900">{label}</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full names" required>
          <Input value={party.full_names} onChange={(e) => set({ full_names: e.target.value })} />
        </Field>
        <Field label="Surname" required>
          <Input value={party.surname} onChange={(e) => set({ surname: e.target.value })} />
        </Field>
        <Field
          label="ID number"
          error={idInvalid ? 'Checksum failed — check the digits' : undefined}
          hint="Date of birth and gender fill in automatically"
        >
          <Input value={party.id_number} onChange={(e) => onIdChange(e.target.value)} maxLength={13} />
        </Field>
        <Field label="Passport (if not an SA citizen)">
          <Input value={party.passport} onChange={(e) => set({ passport: e.target.value })} />
        </Field>
        <Field label="Date of birth">
          <Input type="date" value={party.dob} onChange={(e) => set({ dob: e.target.value })} />
        </Field>
        <Field label="Gender">
          <Select value={party.gender} onChange={(e) => set({ gender: e.target.value })}>
            <option value="">Select…</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </Select>
        </Field>
        <Field label="Occupation">
          <Input value={party.occupation} onChange={(e) => set({ occupation: e.target.value })} />
        </Field>
        <Field label="Employer">
          <Input value={party.employer} onChange={(e) => set({ employer: e.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Physical address" required>
            <Input
              value={party.physical_address}
              onChange={(e) => set({ physical_address: e.target.value })}
              placeholder="Street, suburb, city"
            />
          </Field>
        </div>
        <Field label="Phone">
          <Input value={party.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Email">
          <Input type="email" value={party.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Monthly income (R)">
          <Input
            type="number"
            min={0}
            value={party.income}
            onChange={(e) => set({ income: Number(e.target.value) })}
          />
        </Field>
        <Field label="Pension fund">
          <Input
            value={party.pension_fund_name}
            onChange={(e) => set({ pension_fund_name: e.target.value })}
          />
        </Field>
      </div>
    </fieldset>
  );
}
