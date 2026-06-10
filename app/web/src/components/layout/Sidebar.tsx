import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import type { Role } from '../../api/types';

interface NavItem {
  to: string;
  label: string;
  /** Roles que pueden ver el item. */
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/tickets',
    label: 'Cola de tickets',
    roles: ['reportante', 'agente', 'administrador'],
  },
  {
    to: '/tickets/nuevo',
    label: 'Crear ticket',
    roles: ['reportante', 'agente', 'administrador'],
  },
  { to: '/sla', label: 'Escalados SLA', roles: ['agente', 'administrador'] },
  { to: '/reports', label: 'Reportes', roles: ['administrador'] },
];

export function Sidebar() {
  const { session } = useAuth();
  const role = session?.user.role;

  const items = NAV_ITEMS.filter((item) => role && item.roles.includes(role));

  return (
    <aside className="w-60 shrink-0 bg-white border-r border-slate-200 hidden md:flex md:flex-col">
      <div className="h-14 flex items-center px-4 border-b border-slate-200">
        <span className="text-base font-bold tracking-tight text-slate-900">
          Sistema de <span className="text-indigo-600">Tickets</span>
        </span>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/tickets'}
            className={({ isActive }) =>
              `px-3 py-2 rounded-sm text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
