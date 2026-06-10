import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { Role } from '../../api/types';

const roleLabels: Record<Role, string> = {
  reportante: 'Reportante',
  agente: 'Agente',
  administrador: 'Administrador',
};

export function Topbar() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="h-14 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between gap-4 px-4">
      <div className="flex-1 max-w-md">
        <input
          type="search"
          placeholder="Buscar por #TKT o título…"
          className="block w-full px-3 py-1.5 border border-slate-300 rounded-sm text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none"
          aria-label="Buscar tickets"
        />
      </div>
      <div className="flex items-center gap-3">
        {session && (
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium text-slate-900 leading-tight">
              {session.user.email}
            </p>
            <p className="text-xs text-slate-500 leading-tight">
              {roleLabels[session.user.role]}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-300 rounded-sm hover:bg-slate-50 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
