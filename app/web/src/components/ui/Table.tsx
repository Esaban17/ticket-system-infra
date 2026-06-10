import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

/** Tabla densa (padding compacto) estilo cola de tickets de los wireframes. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto bg-white border border-slate-200 rounded-sm shadow-sm">
      <table className="w-full text-left text-sm border-collapse">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function Th({
  children,
  className = '',
  ...rest
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={`px-3 py-2 font-semibold ${className}`} {...rest}>
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
  ...rest
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-3 py-2 text-slate-700 ${className}`} {...rest}>
      {children}
    </td>
  );
}
