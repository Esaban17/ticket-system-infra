import { useParams } from 'react-router-dom';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900">Detalle del ticket</h1>
      <p className="mt-1 text-xs text-slate-400 font-mono">{id}</p>
      <p className="mt-2 text-sm text-slate-500">En construcción (FE-05)</p>
    </div>
  );
}
