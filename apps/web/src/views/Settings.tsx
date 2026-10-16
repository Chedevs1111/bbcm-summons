import { USER_ROLE_LABELS } from '@bbcm/schema';
import { useState } from 'react';
import { useSession } from '../lib/session';
import { Badge, Card, Field, Input, PageHeader, Select } from '../components/ui';

const TABS = ['Profile', 'Notifications', 'Appearance', 'Defaults', 'Security'] as const;

export function Settings() {
  const { user, firm } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Profile');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Manage your profile, preferences and security." />

      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((option) => (
          <button
            key={option}
            onClick={() => setTab(option)}
            className={
              tab === option
                ? '-mb-px border-b-2 border-gold-500 px-4 py-2 text-sm font-semibold text-gold-700'
                : '-mb-px border-b-2 border-transparent px-4 py-2 text-sm text-slate-600 hover:text-slate-900'
            }
          >
            {option}
          </button>
        ))}
      </div>

      <Card className="p-6">
        {tab === 'Profile' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input defaultValue={user?.full_name} readOnly />
            </Field>
            <Field label="Email">
              <Input defaultValue={user?.email} readOnly />
            </Field>
            <Field label="Phone">
              <Input defaultValue={user?.phone} readOnly />
            </Field>
            <Field label="LPC number" hint="Legal Practice Council practitioner number">
              <Input defaultValue={user?.lpc_number} readOnly />
            </Field>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Role</p>
              <Badge tone="blue">
                {user ? (USER_ROLE_LABELS[user.role] ?? user.role) : '—'}
              </Badge>
            </div>
            <div>
              <p className="mb-1 text-sm font-medium text-slate-700">Law firm</p>
              <p className="text-sm text-slate-900">{firm?.name ?? '—'}</p>
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Ask a firm administrator to change your profile details.
            </p>
          </div>
        )}

        {tab === 'Notifications' && (
          <p className="text-sm text-slate-600">
            Email and WhatsApp notifications for matter status changes and Sheriff service events
            are part of the firm-operations phase and are not enabled yet.
          </p>
        )}

        {tab === 'Appearance' && (
          <Field label="Theme">
            <Select defaultValue="light">
              <option value="light">Light</option>
              <option value="system">Match system</option>
            </Select>
          </Field>
        )}

        {tab === 'Defaults' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default province">
              <Input defaultValue={firm?.province ?? ''} readOnly />
            </Field>
            <Field label="Default court type">
              <Select defaultValue="high_court">
                <option value="high_court">High Court</option>
                <option value="regional_court">Regional Court</option>
              </Select>
            </Field>
          </div>
        )}

        {tab === 'Security' && (
          <div className="space-y-4 text-sm text-slate-600">
            <p>
              Sessions expire after 8 hours and are stored server-side, so signing out revokes
              access immediately on every device.
            </p>
            <p>
              Matter data is scoped to <strong>{firm?.name}</strong>. Users at other firms cannot
              read your matters, documents or uploaded files.
            </p>
            <p>Every change to a matter is written to the audit trail with your user and IP address.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
