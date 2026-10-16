import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white shadow-sm',
        'transition-shadow duration-300 hover:shadow-md',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BUTTON_VARIANTS = {
  primary: 'bg-gold-500 text-white hover:bg-gold-600 focus-visible:outline-gold-500',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600',
} as const;

export function Button({
  variant = 'primary',
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold',
        'transition duration-200 hover:-translate-y-px active:translate-y-0',
        'focus-visible:outline-2 focus-visible:outline-offset-2',
        // No lift while disabled — a control that moves reads as one that responds.
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
        BUTTON_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const CONTROL =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-gold-500 focus:outline-2 focus:outline-offset-0 focus:outline-gold-500/30';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, className)} />;
}

// React 19 passes `ref` as an ordinary prop to function components, so the
// Template Designer can hold a ref for caret-aware marker insertion.
export function Textarea({
  className,
  ref,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  ref?: React.Ref<HTMLTextAreaElement>;
}) {
  return <textarea ref={ref} {...props} className={cn(CONTROL, 'font-mono', className)} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(CONTROL, className)}>
      {children}
    </select>
  );
}

export function Checkbox({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 size-4 rounded border-slate-300 text-gold-500 focus:ring-gold-500"
      />
      <span>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-xs text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Tone carries meaning, so pick by what the label says and not by what looks varied.
 *
 * `amber` is the one to be careful with: it means the reader should look at something —
 * a value that diverged, low confidence, a deviation from a practice directive. It is
 * not a fourth colour for taxonomy chips. A plain `slate` badge is the right default for
 * neutral metadata, even where that leaves two grey chips side by side.
 */
const BADGE_TONES = {
  slate: 'bg-slate-100 text-slate-700', // neutral metadata, counts, attributes
  amber: 'bg-amber-100 text-amber-800', // caution: needs a human's attention
  green: 'bg-emerald-100 text-emerald-800', // settled, complete, default
  blue: 'bg-blue-100 text-blue-800', // category or classification
  red: 'bg-red-100 text-red-700', // failed or inactive
} as const;

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: keyof typeof BADGE_TONES;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <p className="font-semibold text-slate-900">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <div className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-gold-500" />
      {label ?? 'Loading…'}
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {message}
    </div>
  );
}

/** Confidence pill used by Review & Confirm and Detailed OCR. */
export function ConfidenceBadge({ value }: { value: number }) {
  const percent = Math.round(value * 100);
  const tone = value >= 0.9 ? 'green' : value >= 0.8 ? 'blue' : value >= 0.6 ? 'amber' : 'red';
  return <Badge tone={tone}>{percent}%</Badge>;
}
