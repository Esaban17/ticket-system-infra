import { ApiError } from '../../api/client';

interface ErrorBannerProps {
  /** ApiError (Problem Details), Error genérico o mensaje plano. */
  error: unknown;
  onDismiss?: () => void;
}

/** Banner de error que muestra el `detail` de Problem Details cuando existe. */
export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  if (!error) return null;

  let title = 'Error';
  let detail = 'Ocurrió un error inesperado.';
  let requestId: string | undefined;

  if (error instanceof ApiError) {
    title = error.title;
    detail = error.detail;
    requestId = error.requestId;
  } else if (error instanceof Error) {
    detail = error.message;
  } else if (typeof error === 'string') {
    detail = error;
  }

  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-4 bg-red-50 border border-red-200 text-red-800 rounded-sm px-4 py-3 text-sm"
    >
      <div>
        <p className="font-semibold">{title}</p>
        <p>{detail}</p>
        {requestId && (
          <p className="mt-1 text-xs text-red-600">request_id: {requestId}</p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-red-600 hover:text-red-800 font-medium"
          aria-label="Cerrar"
        >
          ✕
        </button>
      )}
    </div>
  );
}
