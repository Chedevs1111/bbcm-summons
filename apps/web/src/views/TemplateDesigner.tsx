import {
  GENERATED_DOCUMENT_LABELS,
  GENERATED_DOCUMENT_TYPES,
  MARRIAGE_REGIMES,
  MARRIAGE_REGIME_LABELS,
  type GeneratedDocumentType,
  type MarriageRegime,
} from '@bbcm/schema';
import { parseDocument, renderHtml, substituteVariables } from '@bbcm/documents/markers';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bold, Italic, Save, Trash2, Underline } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { count } from '../lib/format';
import type { FirmTemplate } from '../lib/types';
import {
  Button, Card, Checkbox, ErrorNotice, Field, Input, PageHeader, Select, Spinner, Textarea,
} from '../components/ui';

/** Sample values so the preview reads like a real document while editing. */
const SAMPLE_VALUES: Record<string, string> = {
  COURT_HEADING: 'IN THE HIGH COURT OF SOUTH AFRICA\n(GAUTENG DIVISION, PRETORIA)',
  COURT_NAME: 'Gauteng Division, Pretoria',
  COURT_LOCATION: 'Pretoria',
  CASE_NUMBER: '12345/2026',
  PROVINCE: 'Gauteng',
  CITE: 'the above Honourable High Court of South Africa, Gauteng Division',
  PLAINTIFF_FULL_NAME: 'THANDIWE GRACE MOKOENA',
  PLAINTIFF_SURNAME: 'Mokoena',
  PLAINTIFF_NAMES: 'Thandiwe Grace',
  PLAINTIFF_ID: '8801010509084',
  PLAINTIFF_ADDRESS: '45 Jacaranda Avenue, Arcadia, Pretoria',
  PLAINTIFF_OCCUPATION: 'teacher',
  PLAINTIFF_GENDER: 'female',
  DEFENDANT_FULL_NAME: 'SIPHO DANIEL MOKOENA',
  DEFENDANT_SURNAME: 'Mokoena',
  DEFENDANT_NAMES: 'Sipho Daniel',
  DEFENDANT_ID: '8506155048083',
  DEFENDANT_ADDRESS: '12 Protea Road, Centurion',
  DEFENDANT_OCCUPATION: 'engineer',
  DEFENDANT_GENDER: 'male',
  MARRIAGE_DATE: '14 February 2015',
  MARRIAGE_PLACE: 'Pretoria',
  MARRIAGE_REGIME: 'in community of property',
  MARRIAGE_TYPE: 'Civil marriage (Marriage Act 25 of 1961)',
  NUMBER_OF_CHILDREN: 'two',
  CHILDREN_VERB: 'are',
  CHILDREN_NOUN: 'children',
  CHILDREN_LIST: '   4.1 Lerato Mokoena, born on 20 March 2017;\n   4.2 Kabelo Mokoena, born on 5 November 2020;',
  TODAY: '3rd day of August 2026',
  FIRM_NAME: 'VAN DER MERWE & ASSOCIATES',
  FIRM_ADDRESS: '123 Church Street\nPretoria\nGauteng',
  INDEX_ITEMS: '1. Combined Summons\n2. Particulars of Claim\n3. Annexure "A" — Marriage Certificate',
  ANNEXURE_ITEMS: '4.   "D"      Payslip                                    payslip.pdf',
  CLAUSES: '1. The parties are married in community of property…',
};

const VARIABLE_GROUPS: Array<{ heading: string; tokens: string[] }> = [
  { heading: 'Court & case', tokens: ['COURT_HEADING', 'COURT_NAME', 'COURT_LOCATION', 'CASE_NUMBER', 'PROVINCE', 'CITE'] },
  { heading: 'Plaintiff', tokens: ['PLAINTIFF_FULL_NAME', 'PLAINTIFF_SURNAME', 'PLAINTIFF_NAMES', 'PLAINTIFF_ID', 'PLAINTIFF_ADDRESS', 'PLAINTIFF_OCCUPATION', 'PLAINTIFF_GENDER'] },
  { heading: 'Defendant', tokens: ['DEFENDANT_FULL_NAME', 'DEFENDANT_SURNAME', 'DEFENDANT_NAMES', 'DEFENDANT_ID', 'DEFENDANT_ADDRESS', 'DEFENDANT_OCCUPATION', 'DEFENDANT_GENDER'] },
  { heading: 'Marriage', tokens: ['MARRIAGE_DATE', 'MARRIAGE_PLACE', 'MARRIAGE_REGIME', 'MARRIAGE_TYPE'] },
  { heading: 'Children & date', tokens: ['NUMBER_OF_CHILDREN', 'CHILDREN_VERB', 'CHILDREN_NOUN', 'CHILDREN_LIST', 'TODAY', 'FIRM_NAME', 'FIRM_ADDRESS'] },
  { heading: 'Generated blocks', tokens: ['INDEX_ITEMS', 'ANNEXURE_ITEMS', 'CLAUSES'] },
];

const MARKERS: Array<{ label: string; icon?: React.ReactNode; open: string; close?: string }> = [
  { label: 'Bold', icon: <Bold className="size-4" />, open: '{{B}}', close: '{{/B}}' },
  { label: 'Italic', icon: <Italic className="size-4" />, open: '{{I}}', close: '{{/I}}' },
  { label: 'Underline', icon: <Underline className="size-4" />, open: '{{U}}', close: '{{/U}}' },
  { label: 'Centre', open: '{{C}}', close: '{{/C}}' },
  { label: 'Right', open: '{{R}}', close: '{{/R}}' },
  { label: 'Double line', open: '\n══════════════════════════════════════════\n' },
  { label: 'Single line', open: '\n──────────────────────────────────────────\n' },
  { label: 'Signature line', open: '\n_______________________________________\n' },
];

export function TemplateDesigner() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState<GeneratedDocumentType>('summons');
  const [regime, setRegime] = useState<MarriageRegime | ''>('');
  const [contested, setContested] = useState<'' | 'yes' | 'no'>('');
  const [children, setChildren] = useState<'' | 'yes' | 'no'>('');
  const [body, setBody] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<{ templates: FirmTemplate[] }>('/admin/templates'),
  });

  const existing = useMemo(
    () => data?.templates.find((template) => template.id === templateId),
    [data, templateId],
  );

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setDocumentType(existing.document_type);
    setRegime(existing.marriage_regime ?? '');
    setContested(existing.is_contested === null ? '' : existing.is_contested === 1 ? 'yes' : 'no');
    setChildren(existing.has_children === null ? '' : existing.has_children === 1 ? 'yes' : 'no');
    setBody(existing.body);
    setIsActive(existing.is_active === 1);
    setIsDefault(existing.is_default === 1);
  }, [existing]);

  const preview = useMemo(() => {
    try {
      return renderHtml(parseDocument(substituteVariables(body, SAMPLE_VALUES)));
    } catch {
      return '<p class="line">Preview unavailable — check your markers.</p>';
    }
  }, [body]);

  const insert = (open: string, close?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const { selectionStart, selectionEnd } = editor;
    const selected = body.slice(selectionStart, selectionEnd);
    const inserted = close ? `${open}${selected}${close}` : open;
    const next = body.slice(0, selectionStart) + inserted + body.slice(selectionEnd);
    setBody(next);
    // Put the caret after the inserted text once React has re-rendered.
    requestAnimationFrame(() => {
      editor.focus();
      const caret = selectionStart + inserted.length;
      editor.setSelectionRange(caret, caret);
    });
  };

  const payload = () => ({
    name,
    document_type: documentType,
    marriage_regime: regime || null,
    is_contested: contested === '' ? null : contested === 'yes',
    has_children: children === '' ? null : children === 'yes',
    body,
    is_active: isActive,
    is_default: isDefault,
  });

  const save = useMutation({
    mutationFn: () =>
      templateId
        ? api.put(`/admin/templates/${templateId}`, payload())
        : api.post('/admin/templates', payload()),
    onSuccess: async () => {
      toast.success('Template saved');
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      navigate('/templates');
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not save'),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/admin/templates/${templateId}`),
    onSuccess: async () => {
      toast.success('Template deleted');
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      navigate('/templates');
    },
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={templateId ? 'Edit Template' : 'New Template'}
        description="Build court document templates with formatting markers and a live A4 preview."
        actions={
          <>
            {templateId && (
              <Button variant="danger" onClick={() => remove.mutate()}>
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
            <Button disabled={!name || save.isPending} onClick={() => save.mutate()}>
              <Save className="size-4" /> {save.isPending ? 'Saving…' : 'Save template'}
            </Button>
          </>
        }
      />

      {error && <div className="mb-4"><ErrorNotice message={error} /></div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Template name" required>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Standard Combined Summons"
                  />
                </Field>
              </div>

              <Field label="Document type">
                <Select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as GeneratedDocumentType)}
                >
                  {GENERATED_DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>{GENERATED_DOCUMENT_LABELS[type]}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Marriage regime" hint="Leave as “Any” to apply to every regime">
                <Select value={regime} onChange={(e) => setRegime(e.target.value as MarriageRegime | '')}>
                  <option value="">Any regime</option>
                  {MARRIAGE_REGIMES.map((option) => (
                    <option key={option} value={option}>{MARRIAGE_REGIME_LABELS[option]}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Contested">
                <Select value={contested} onChange={(e) => setContested(e.target.value as typeof contested)}>
                  <option value="">Any</option>
                  <option value="yes">Contested only</option>
                  <option value="no">Uncontested only</option>
                </Select>
              </Field>

              <Field label="Children">
                <Select value={children} onChange={(e) => setChildren(e.target.value as typeof children)}>
                  <option value="">Any</option>
                  <option value="yes">With minor children</option>
                  <option value="no">No minor children</option>
                </Select>
              </Field>

              <div className="flex gap-6 sm:col-span-2">
                <Checkbox label="Active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <Checkbox label="Default" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {MARKERS.map((marker) => (
                <button
                  key={marker.label}
                  type="button"
                  onClick={() => insert(marker.open, marker.close)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {marker.icon}
                  {marker.label}
                </button>
              ))}
            </div>

            <Textarea
              ref={editorRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={24}
              placeholder="Start typing, or insert a variable from the palette…"
              className="text-xs leading-relaxed"
            />
            <p className="mt-2 text-xs text-slate-500">
              {count(body.length, 'character')} · {count(body.split('\n').length, 'line')}
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-4">
            <h2 className="mb-3 font-semibold text-slate-900">Insert variable</h2>
            <div className="max-h-80 space-y-4 overflow-y-auto">
              {VARIABLE_GROUPS.map((group) => (
                <div key={group.heading}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {group.heading}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {group.tokens.map((token) => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => insert(`{{${token}}}`)}
                        className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-700 transition hover:border-amber-400 hover:bg-amber-50"
                      >
                        {token}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 font-semibold text-slate-900">Live preview</h2>
            <div className="max-h-[36rem] overflow-auto rounded-lg bg-slate-100 p-3">
              <div
                className="court-doc bg-white p-6 text-[11px] shadow-sm"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">Rendered with sample matter data.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
