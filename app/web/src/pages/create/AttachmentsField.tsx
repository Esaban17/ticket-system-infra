import { useRef, useState, type DragEvent } from 'react';
import { requestUpload } from '../../api/attachments';
import { Spinner } from '../../components/ui/Spinner';
import { MAX_ATTACHMENTS, MAX_FILE_BYTES } from './constants';

export interface UploadedAttachment {
  attachmentId: string;
  filename: string;
  sizeBytes: number;
}

/** Whitelist del contrato: pdf, png, jpeg, docx, xlsx, txt, log (por extensión → MIME). */
const EXT_CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  log: 'text/plain',
};

const ACCEPT_ATTR = '.pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt,.log';

function contentTypeFor(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONTENT_TYPES[ext] ?? null;
}

function formatSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

interface AttachmentsFieldProps {
  attachments: UploadedAttachment[];
  onChange: (next: UploadedAttachment[]) => void;
  disabled: boolean;
}

/**
 * Dropzone + input file. Por cada archivo: requestUpload() (presign) y PUT
 * del binario a uploadUrl. Si el presign o el PUT fallan (ej. local sin AWS),
 * muestra un warning NO bloqueante y permite enviar el ticket sin adjuntos.
 */
export function AttachmentsField({
  attachments,
  onChange,
  disabled,
}: AttachmentsFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0 || disabled || uploading) return;
    setFileError(null);
    setWarning(null);

    const files = Array.from(fileList);
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      if (!contentTypeFor(file)) {
        rejected.push(`${file.name} (tipo no permitido)`);
      } else if (file.size > MAX_FILE_BYTES || file.size === 0) {
        rejected.push(`${file.name} (máx. 10MB)`);
      } else {
        accepted.push(file);
      }
    }

    if (attachments.length + accepted.length > MAX_ATTACHMENTS) {
      setFileError(`Máximo ${MAX_ATTACHMENTS} adjuntos por ticket.`);
      return;
    }
    if (rejected.length > 0) {
      setFileError(
        `Archivos omitidos: ${rejected.join(', ')}. Permitidos: PDF, PNG, JPG, DOCX, XLSX, TXT, LOG hasta 10MB.`,
      );
    }
    if (accepted.length === 0) return;

    setUploading(true);
    const uploaded: UploadedAttachment[] = [];
    let failed = false;

    for (const file of accepted) {
      try {
        const presign = await requestUpload({
          filename: file.name,
          contentType: contentTypeFor(file) as string,
          sizeBytes: file.size,
        });
        const putResponse = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': contentTypeFor(file) as string },
          body: file,
        });
        if (!putResponse.ok) throw new Error(`PUT ${putResponse.status}`);
        uploaded.push({
          attachmentId: presign.attachmentId,
          filename: file.name,
          sizeBytes: file.size,
        });
      } catch {
        failed = true;
      }
    }

    if (failed) {
      setWarning(
        'Adjuntos no disponibles en este entorno. Puedes enviar el ticket sin adjuntos.',
      );
    }
    if (uploaded.length > 0) onChange([...attachments, ...uploaded]);
    setUploading(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    void handleFiles(event.dataTransfer.files);
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-700">
        Adjuntos <span className="font-normal text-slate-400">(opcional)</span>
      </label>

      <div
        role="button"
        tabIndex={0}
        aria-label="Subir adjuntos"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-sm p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
        } ${disabled || uploading ? 'opacity-60 pointer-events-none' : ''}`}
      >
        {uploading ? (
          <Spinner label="Subiendo archivos…" />
        ) : (
          <>
            <p className="text-sm text-slate-600 font-medium">
              Arrastra archivos o{' '}
              <span className="text-indigo-600 underline">selecciona localmente</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              PDF, PNG, JPG, DOCX, XLSX, TXT, LOG — hasta 10MB por archivo.
            </p>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          data-testid="create-attachments-input"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {fileError && <p className="text-xs text-red-600">{fileError}</p>}

      {warning && (
        <div
          role="status"
          className="bg-amber-50 border border-amber-200 text-amber-800 rounded-sm px-3 py-2 text-xs"
        >
          {warning}
        </div>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-2">
          {attachments.map((file) => (
            <li
              key={file.attachmentId}
              className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-sm"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">
                  {file.filename}
                </p>
                <p className="text-[11px] text-slate-400">
                  {formatSize(file.sizeBytes)} · Subido
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onChange(
                    attachments.filter((a) => a.attachmentId !== file.attachmentId),
                  )
                }
                className="text-xs font-semibold text-red-600 hover:text-red-800 shrink-0 ml-3"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
