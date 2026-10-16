import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api } from './api';
import type { LawFirm, SessionUser } from './types';

interface SessionState {
  user: SessionUser | null;
  firm: LawFirm | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState>({
  user: null,
  firm: null,
  loading: true,
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    // A 401 here is the normal signed-out state, not an error worth retrying.
    queryFn: () =>
      api.get<{ user: SessionUser; firm: LawFirm | null }>('/auth/me').catch(() => null),
    retry: false,
    staleTime: 60_000,
  });

  const signOut = async () => {
    await api.post('/auth/logout').catch(() => {});
    queryClient.clear();
    window.location.href = '/login';
  };

  return (
    <SessionContext.Provider
      value={{
        user: data?.user ?? null,
        firm: data?.firm ?? null,
        loading: isLoading,
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

export function canAdminister(role: string | undefined): boolean {
  return role === 'super_admin' || role === 'firm_admin';
}
