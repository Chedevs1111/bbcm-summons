import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, BookMarked, Download, FileWarning, Layers } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, downloadFile } from '../lib/api';
import { count, pageRange, statLabel } from '../lib/format';
import { Badge, Button, Card, ErrorNotice, PageHeader, Spinner } from '../components/ui';

interface BundleEntry {
  number: number;
  title: string;
  startPage: number;
  pageCount: number;
  kind: 'document' | 'annexure';
  annexureLabel?: string;
}

interface BundleVolume {
  volume_number: number;
  first_page: number;
  last_page: number;
  page_count: number;
  size_bytes: number;
  file_name: string;
  entries: BundleEntry[];
}

interface BundleManifest {
  total_pages: number;
  index: BundleEntry[];
  volumes: BundleVolume[];
  warnings: { unreadable_annexures: string[]; skipped_annexures: string[] };
}

const MAX_PAGES_PER_VOLUME = 120;

export function CourtBundle() {
  const { id } = useParams();
  const [split, setSplit] = useState(true);
  const [downloading, setDownloading] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['bundle', id, split],
    queryFn: () => api.get<BundleManifest>(`/matters/${id}/bundle?split=${split}`),
    enabled: Boolean(id),
  });

  const download = async (volume: BundleVolume) => {
    setDownloading(volume.volume_number);
    try {
      await downloadFile(
        `/matters/${id}/bundle/${volume.volume_number}?split=${split}`,
        volume.file_name,
      );
      toast.success(`Volume ${volume.volume_number} downloaded`);
    } catch {
      toast.error('Could not build the bundle');
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Court Bundle"
        description="Paginated, indexed and bookmarked PDF for upload to Court Online / CaseLines."
        actions={
          <Link to={`/matters/${id}/documents`}>
            <Button variant="secondary">Documents</Button>
          </Link>
        }
      />

      {isLoading && <Spinner label="Building the bundle…" />}
      {error && <ErrorNotice message={(error as Error).message} />}

      {data && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total pages" singular="Total page" value={data.total_pages} />
            <Stat label="Volumes" singular="Volume" value={data.volumes.length} />
            <Stat label="Items indexed" singular="Item indexed" value={data.index.length} />
            <Stat
              label="Annexures"
              singular="Annexure"
              value={data.index.filter((entry) => entry.kind === 'annexure').length}
            />
          </div>

          {(data.warnings.unreadable_annexures.length > 0 ||
            data.warnings.skipped_annexures.length > 0) && (
            <Card className="mb-6 border-amber-300 bg-amber-50 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="size-5 shrink-0 text-amber-600" />
                <div className="text-sm text-amber-900">
                  {data.warnings.unreadable_annexures.length > 0 && (
                    <p>
                      <strong>Could not be read:</strong>{' '}
                      {data.warnings.unreadable_annexures.join(', ')}. A placeholder page stands in
                      its place — re-upload the file or file it separately before serving.
                    </p>
                  )}
                  {data.warnings.skipped_annexures.length > 0 && (
                    <p className="mt-1">
                      <strong>Left out:</strong> {data.warnings.skipped_annexures.join(', ')} — the
                      bundle exceeded the size a single build can hold.
                    </p>
                  )}
                </div>
              </div>
            </Card>
          )}

          <Card className="mb-6 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={split}
                onChange={(e) => setSplit(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300 text-gold-500 focus:ring-gold-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-700">
                  Split into volumes of {MAX_PAGES_PER_VOLUME} pages
                </span>
                <span className="block text-xs text-slate-500">
                  Practice Directive 1 of 2024 para 33.25. A volume runs longer only where that is
                  the only way to keep a document whole.
                </span>
              </span>
            </label>
          </Card>

          <Card className="mb-6">
            <h2 className="border-b border-slate-200 p-4 font-semibold text-slate-900">
              Volumes
            </h2>
            <ul className="divide-y divide-slate-100">
              {data.volumes.map((volume) => (
                <li key={volume.volume_number} className="flex flex-wrap items-center gap-3 p-4">
                  <Layers className="size-5 shrink-0 text-gold-600" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {data.volumes.length > 1
                        ? `Volume ${volume.volume_number} of ${data.volumes.length}`
                        : 'Court bundle'}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {pageRange(volume.first_page, volume.last_page)} ·{' '}
                      {count(volume.page_count, 'page')} · {Math.round(volume.size_bytes / 1024)} KB
                    </p>
                  </div>
                  {volume.page_count > MAX_PAGES_PER_VOLUME && (
                    <Badge tone="amber">over 120 — kept whole</Badge>
                  )}
                  <Button
                    disabled={downloading !== null}
                    onClick={() => download(volume)}
                  >
                    <Download className="size-4" />
                    {downloading === volume.volume_number ? 'Building…' : 'Download PDF'}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="flex items-center gap-2 border-b border-slate-200 p-4">
              <BookMarked className="size-5 text-gold-600" />
              <h2 className="font-semibold text-slate-900">Index</h2>
              <span className="ml-auto text-xs text-slate-500">
                Page references as printed in the bundle
              </span>
            </div>

            {data.index.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center">
                <FileWarning className="size-8 text-slate-300" />
                <p className="text-sm text-slate-500">
                  Nothing to bundle yet — generate the pleadings first.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.index.map((entry) => (
                  <li key={entry.number} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-6 text-right text-slate-400">{entry.number}.</span>
                    <span className="min-w-0 flex-1 truncate text-slate-900">
                      {entry.kind === 'annexure' ? (
                        <>
                          <span className="font-serif font-semibold text-gold-700">
                            Annexure “{entry.annexureLabel}”
                          </span>{' '}
                          — {entry.title}
                        </>
                      ) : (
                        entry.title
                      )}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {entry.pageCount > 1
                        ? `${entry.startPage}–${entry.startPage + entry.pageCount - 1}`
                        : entry.startPage}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <p className="mt-4 text-sm text-slate-500">
            Every page carries a running bundle number, and the PDF opens with a bookmark pane
            covering the cover sheet, index, pleadings and each annexure.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  singular,
  value,
}: {
  /** The plural form, used for every count except one. */
  label: string;
  /** Supplied only where the label is a noun that has a singular. */
  singular?: string;
  value: number;
}) {
  return (
    <Card className="reveal p-4">
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{statLabel(value, label, singular)}</p>
    </Card>
  );
}
