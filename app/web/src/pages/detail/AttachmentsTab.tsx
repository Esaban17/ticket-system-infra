import { useState } from 'react';
import { getDownloadUrl } from '../../api/attachments';
import type { Ticket } from '../../api/types';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorBanner } from '../../components/ui/ErrorBanner';

interface AttachmentItem {
  id: string;
  filename: string;
}

/**
 * El contrato no incluye `attachments` en la respuesta del Ticket; si el API
 * llegara a incluirlos (uuids u objetos), los normalizamos aquí.
 */
function extractAttachments(ticket: Ticket): AttachmentItem[] {
  const raw = (ticket as Ticket & { attachments?: unknown }).attachments;
  if (!Array.isArray(raw)) return [];
  const items: AttachmentItem[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      items.push({ id: entry, filename: entry });
    } else if (entry && typeof entry === 'object') {
      const obj = entry as Record<string, unknown>;
      const id =
        typeof obj['id'] === 'string'
          ? obj['id']
          : typeof obj['attachmentId'] === 'string'
            ? obj['attachmentId']
            : null;
      if (!id) continue;
      const filename =
        typeof obj['filename'] === 'string' ? obj['filename'] : id;
      items.push({ id, filename });
    }
  }
  return items;
}

/** TAB Adjuntos: lista (si el ticket los incluye) + descarga presignada. */
export function AttachmentsTab({ ticket }: { ticket: Ticket }) {
  const [error, setError] = useState<unknown>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const attachments = extractAttachments(ticket);

  const handleDownload = async (attachmentId: string) => {
    setError(null);
    setDownloadingId(attachmentId);
    try {
      const { downloadUrl } = await getDownloadUrl(attachmentId);
      window.open(downloadUrl, '_blank', 'noopener');
    } catch (err) {
      setError(err);
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {error != null && (
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      )}
      <Card title="Adjuntos">
        {attachments.length === 0 ? (
          <EmptyState
            title="Sin adjuntos"
            description="Este ticket no tiene archivos adjuntos."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {attachments.map((att) => (
              <li
                key={att.id}
                className="flex items-center justify-between gap-4 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-900">
                    {att.filename}
                  </p>
                  <p className="truncate text-xs font-mono text-slate-400">
                    {att.id}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleDownload(att.id)}
                  disabled={downloadingId === att.id}
                >
                  {downloadingId === att.id ? 'Generando…' : 'Descargar'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
