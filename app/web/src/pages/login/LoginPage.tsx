import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../../api/auth';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/ui/Button';
import { ErrorBanner } from '../../components/ui/ErrorBanner';

/**
 * Pantalla de login (FE-02). Llama a POST /v1/auth/login (mock: el password
 * no se verifica hasta EP-14/Cognito), persiste la sesión en AuthContext y
 * redirige a la ruta original (state.from de RequireAuth) o a /tickets.
 */
export function LoginPage() {
  const { session, setSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/tickets';

  // Con sesión activa el login no aplica: directo a la app.
  if (session) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await login(email.trim(), password);
      setSession({ token, user });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col bg-slate-50">
      <main className="flex-grow flex flex-col items-center justify-center px-4 py-12">
        {/* Branding */}
        <div className="mb-8 flex flex-col items-center">
          <div
            aria-hidden="true"
            className="h-12 w-12 mb-4 rounded-sm bg-indigo-600 text-white flex items-center justify-center text-xl font-bold tracking-tight"
          >
            T_
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Sistema de <span className="text-indigo-600">Tickets</span>
          </h1>
        </div>

        {/* Tarjeta de login */}
        <div className="w-full max-w-[440px] bg-white border border-slate-200 shadow-sm rounded-sm p-8">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900">Iniciar sesión</h2>
            <p className="text-slate-500 mt-1 text-sm">
              Acceso al sistema de tickets internos
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit} noValidate>
            {error != null && (
              <ErrorBanner error={error} onDismiss={() => setError(null)} />
            )}

            <div>
              <label
                className="block text-sm font-medium text-slate-700 mb-1.5"
                htmlFor="email"
              >
                Correo corporativo
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                data-testid="login-email"
                placeholder="usuario@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full px-3 py-2 border border-slate-300 rounded-sm focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all placeholder:text-slate-400 text-sm"
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium text-slate-700 mb-1.5"
                htmlFor="password"
              >
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  data-testid="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full px-3 py-2 pr-10 border border-slate-300 rounded-sm focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 outline-none transition-all text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors text-xs font-medium"
                  aria-label={
                    showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                  }
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full py-2.5"
              disabled={loading}
              data-testid="login-submit"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Iniciando sesión…
                </>
              ) : (
                'Iniciar sesión'
              )}
            </Button>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">o</span>
              </div>
            </div>

            {/* El Button deshabilitado anula pointer-events: el tooltip vive en el wrapper. */}
            <span
              className="block cursor-not-allowed"
              title="Disponible con la integración de Cognito (EP-14)"
            >
              <Button
                type="button"
                variant="secondary"
                className="w-full py-2.5"
                disabled
                title="Disponible con la integración de Cognito (EP-14)"
              >
                Iniciar con SSO corporativo
              </Button>
            </span>
          </form>
        </div>

        {/* Ayuda para desarrollo local (login mock — BL-027) */}
        <div className="w-full max-w-[440px] mt-4 bg-indigo-50 border border-indigo-100 rounded-sm px-4 py-3 text-xs text-indigo-900">
          <p className="font-semibold mb-0.5">Usuarios de prueba:</p>
          <p>
            reportante@ticket-system.dev · agente@ticket-system.dev ·
            admin@ticket-system.dev (cualquier contraseña)
          </p>
        </div>
      </main>

      <footer className="w-full py-8 mt-auto border-t border-slate-200">
        <p className="text-center text-xs text-slate-500">
          © 2026 Universidad Galileo — Postgrado Diseño y Desarrollo de Software
        </p>
      </footer>
    </div>
  );
}
