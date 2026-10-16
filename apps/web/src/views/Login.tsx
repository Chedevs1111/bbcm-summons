import { useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api';
import { Button, Card, Field, Input } from '../components/ui';

export function Login() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/auth/login', { email, password });
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      toast.success('Signed in');
      window.location.href = '/';
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-navy-900 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-xl bg-gold-500 font-serif text-2xl font-bold text-white">
            BS
          </div>
          <h1 className="text-2xl font-bold text-white">
            BBCM <span className="text-gold-400">Summons</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">Secure login with encrypted document storage</p>
        </div>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email" required>
              <Input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@yourfirm.co.za"
              />
            </Field>

            <Field label="Password" required>
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <Button type="submit" disabled={submitting} className="w-full">
              <Lock className="size-4" />
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-slate-500">
          Access is logged. Matter data is confined to your firm.
        </p>
      </div>
    </div>
  );
}
