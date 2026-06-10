import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, children, className = '' }: CardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-sm shadow-sm ${className}`}
    >
      {title && (
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
