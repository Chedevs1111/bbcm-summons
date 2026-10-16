import {
  FilePlus2,
  FileStack,
  Layers,
  Briefcase,
  FileText,
  Gavel,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  ScanSearch,
  Settings as SettingsIcon,
  Shield,
  Upload as UploadIcon,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useReveal, useScrollProgress } from '../lib/motion';
import { canAdminister, useSession } from '../lib/session';
import { cn } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Workflow items are unreachable until a matter is open, as in the original app. */
  needsMatter?: boolean;
  adminOnly?: boolean;
}

const GROUPS: Array<{ heading: string; items: NavItem[] }> = [
  {
    heading: 'Main',
    items: [
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard className="size-5" /> },
      { to: '/matters/new', label: 'New Matter', icon: <FilePlus2 className="size-5" /> },
    ],
  },
  {
    heading: 'Workflow',
    items: [
      { to: 'upload', label: 'Upload & Extract', icon: <UploadIcon className="size-5" />, needsMatter: true },
      { to: 'review', label: 'Review & Confirm', icon: <FileText className="size-5" />, needsMatter: true },
      { to: 'ocr', label: 'Detailed OCR', icon: <ScanSearch className="size-5" />, needsMatter: true },
    ],
  },
  {
    heading: 'Generate',
    items: [
      { to: '/templates', label: 'Templates', icon: <Gavel className="size-5" /> },
      { to: '/templates/designer', label: 'Template Designer', icon: <Palette className="size-5" /> },
      { to: 'documents', label: 'Documents', icon: <FileText className="size-5" />, needsMatter: true },
      { to: 'annexures', label: 'Annexures', icon: <FileStack className="size-5" />, needsMatter: true },
      { to: 'bundle', label: 'Court Bundle', icon: <Layers className="size-5" />, needsMatter: true },
    ],
  },
  {
    heading: 'Practice',
    items: [
      { to: 'practice', label: 'Service & Fees', icon: <Briefcase className="size-5" />, needsMatter: true },
    ],
  },
  {
    heading: 'System',
    items: [
      { to: '/admin', label: 'Admin', icon: <Shield className="size-5" />, adminOnly: true },
      { to: '/settings', label: 'Settings', icon: <SettingsIcon className="size-5" /> },
    ],
  },
];

/** The id of the matter currently open, if any — drives the workflow items. */
function useActiveMatterId(): string | null {
  const params = useParams();
  const location = useLocation();
  if (params.id) return params.id;
  const match = /^\/matters\/([0-9a-f-]{36})/i.exec(location.pathname);
  return match?.[1] ?? null;
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, firm, signOut } = useSession();
  const matterId = useActiveMatterId();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  useScrollProgress();

  // One reveal root for the whole app, re-swept on navigation. A view opts a section
  // in by adding `reveal` to its class list; nothing else has to know about motion.
  const revealRoot = useReveal(location.pathname);

  const initials = (user?.full_name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const renderItem = (item: NavItem) => {
    if (item.adminOnly && !canAdminister(user?.role)) return null;

    const disabled = item.needsMatter && !matterId;
    const to = item.needsMatter ? `/matters/${matterId}/${item.to}` : item.to;

    if (disabled) {
      return (
        <span
          key={item.label}
          aria-disabled="true"
          title="Open a matter first"
          className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 opacity-45"
        >
          {item.icon}
          {item.label}
        </span>
      );
    }

    return (
      <NavLink
        key={item.label}
        to={to}
        end={item.to === '/'}
        onClick={() => setMobileOpen(false)}
        className={({ isActive }) =>
          cn(
            // The left rail marker is a pseudo-element so it can grow from nothing on
            // hover rather than shifting the label.
            'relative flex items-center gap-3 rounded-lg py-2 pl-3.5 pr-3 text-sm transition duration-300',
            'before:absolute before:left-0.5 before:top-1/2 before:w-[3px] before:-translate-y-1/2',
            'before:rounded-full before:bg-gold-400 before:transition-all before:duration-300',
            isActive
              ? 'bg-gold-500/10 font-semibold text-gold-300 before:h-5'
              : 'text-slate-300 before:h-0 hover:translate-x-0.5 hover:bg-white/5 hover:text-white hover:before:h-3.5',
          )
        }
      >
        {item.icon}
        {item.label}
      </NavLink>
    );
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-navy-900">
      <div className="flex items-center gap-3 border-b border-navy-800 px-5 py-4">
        <div className="mark-sheen grid size-10 shrink-0 place-items-center rounded-lg border border-gold-500/55 bg-navy-950 shadow-[0_6px_16px_-8px_rgba(201,162,39,0.8)]">
          <span className="goldtext font-serif text-lg font-bold">BS</span>
        </div>
        <div className="min-w-0">
          <p className="goldtext truncate font-bold">BBCM Summons</p>
          <p className="truncate text-[11px] uppercase tracking-wide text-slate-400">
            Legal Document Generator
          </p>
        </div>
      </div>

      <div className="border-b border-navy-800 px-5 py-3">
        <p className="text-[11px] uppercase tracking-wide text-slate-400">Active firm</p>
        <p className="truncate text-sm font-medium text-white">{firm?.name ?? '—'}</p>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {GROUPS.map((group) => {
          const items = group.items.map(renderItem).filter(Boolean);
          if (items.length === 0) return null;
          return (
            <div key={group.heading}>
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {group.heading}
              </p>
              <div className="space-y-0.5">{items}</div>
            </div>
          );
        })}
      </nav>

      <button
        onClick={signOut}
        className="flex items-center gap-3 border-t border-navy-800 px-5 py-3 text-sm text-slate-300 transition hover:bg-navy-800 hover:text-white"
      >
        <LogOut className="size-5" />
        Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-64">{sidebar}</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 w-64">
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute -right-11 top-3 grid size-9 place-items-center rounded-lg bg-white text-slate-700 shadow"
            >
              <X className="size-5" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div
          aria-hidden="true"
          className="scroll-progress pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 no-print"
        />

        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur transition-shadow duration-300 no-print [html[data-scrolled='1']_&]:bg-white [html[data-scrolled='1']_&]:shadow-md">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold text-slate-900">{user?.full_name}</p>
              <p className="text-xs capitalize text-slate-500">
                {user?.role.replace('_', ' ')}
              </p>
            </div>
            {/* The gradient lives on an inner span: `goldtext` sets a background, so a
                background on the same element would be what gets clipped to the text. */}
            <div className="grid size-9 place-items-center rounded-full border border-gold-500/50 bg-navy-900 text-sm font-bold">
              <span className="goldtext">{initials || '?'}</span>
            </div>
          </div>
        </header>

        <main ref={revealRoot} className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
