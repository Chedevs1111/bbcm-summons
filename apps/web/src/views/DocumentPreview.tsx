import { useQuery } from '@tanstack/react-query';
import { Copy, Download, Printer } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, downloadFile } from '../lib/api';
import { Button, Card, ErrorNotice, PageHeader, Spinner } from '../components/ui';

export function DocumentPreview() {
  const { id, documentId } = useParams();
  const [mode, setMode] = useState<'preview' | 'source'>('preview');

  const { data, isLoading, error } = useQuery({
    queryKey: ['document', id, documentId],
    queryFn: () =>
      api.get<{ document: { title: string; body: string; version: number }; html: string }>(
        `/matters/${id}/documents/${documentId}`,
      ),
    enabled: Boolean(id && documentId),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorNotice message={(error as Error).message} />;
  if (!data) return null;

  const copy = async () => {
    // Strip markers so what lands on the clipboard is the readable text.
    const plain = data.document.body.replace(/\{\{\/?[A-Z_]+\}\}/g, '');
    await navigator.clipboard.writeText(plain);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print">
        <PageHeader
          title={data.document.title}
          description={`Version ${data.document.version}`}
          actions={
            <>
              <Link to={`/matters/${id}/documents`}>
                <Button variant="secondary">Back</Button>
              </Link>
              <Button variant="secondary" onClick={copy}>
                <Copy className="size-4" /> Copy
              </Button>
              <Button variant="secondary" onClick={() => window.print()}>
                <Printer className="size-4" /> Print / PDF
              </Button>
              <Button
                onClick={() =>
                  downloadFile(
                    `/matters/${id}/documents/${documentId}/docx`,
                    `${data.document.title}.docx`,
                  ).catch(() => toast.error('Download failed'))
                }
              >
                <Download className="size-4" /> Word
              </Button>
            </>
          }
        />

        <div className="mb-4 inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {(['preview', 'source'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setMode(option)}
              className={
                mode === option
                  ? 'rounded-md bg-navy-900 px-4 py-1.5 text-sm font-medium capitalize text-white'
                  : 'rounded-md px-4 py-1.5 text-sm capitalize text-slate-600 hover:bg-slate-50'
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {mode === 'preview' ? (
        <div className="overflow-x-auto pb-8">
          <div
            className="a4-page court-doc"
            // Server-rendered from the document AST; all user content is HTML-escaped
            // during rendering (see renderHtml in @bbcm/documents).
            dangerouslySetInnerHTML={{ __html: data.html }}
          />
        </div>
      ) : (
        <Card className="no-print p-4">
          <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">
            {data.document.body}
          </pre>
        </Card>
      )}
    </div>
  );
}
