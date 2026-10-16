import { GENERATED_DOCUMENT_LABELS, MARRIAGE_REGIME_LABELS } from '@bbcm/schema';
import { useQuery } from '@tanstack/react-query';
import { Gavel, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { FirmTemplate } from '../lib/types';
import { Badge, Button, Card, EmptyState, ErrorNotice, PageHeader, Spinner } from '../components/ui';

export function Templates() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.get<{ templates: FirmTemplate[] }>('/admin/templates'),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNotice message={(error as Error).message} />;

  const templates = data?.templates ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Templates"
        description="Your firm's court document templates and the matters each one applies to."
        actions={
          <Link to="/templates/designer">
            <Button>
              <Plus className="size-4" /> New template
            </Button>
          </Link>
        }
      />

      <Card>
        {templates.length === 0 ? (
          <EmptyState
            icon={<Gavel className="size-10" />}
            title="No templates yet"
            description="Create your first template in the Template Designer."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {templates.map((template) => (
              <li key={template.id}>
                <Link
                  to={`/templates/designer/${template.id}`}
                  className="flex flex-wrap items-center gap-3 p-4 transition hover:bg-slate-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{template.name}</p>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {GENERATED_DOCUMENT_LABELS[template.document_type] ?? template.document_type}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {template.marriage_regime && (
                      <Badge tone="blue">
                        {MARRIAGE_REGIME_LABELS[template.marriage_regime] ?? template.marriage_regime}
                      </Badge>
                    )}
                    {template.is_contested !== null && (
                      <Badge>
                        {template.is_contested === 1 ? 'contested' : 'uncontested'}
                      </Badge>
                    )}
                    {template.has_children !== null && (
                      <Badge>{template.has_children === 1 ? 'with children' : 'no children'}</Badge>
                    )}
                    {template.is_default === 1 && <Badge tone="green">default</Badge>}
                    {template.is_active === 0 && <Badge tone="red">inactive</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-sm text-slate-500">
        When generating, the most specific matching template wins: regime, then contested status,
        then whether there are minor children.
      </p>
    </div>
  );
}
