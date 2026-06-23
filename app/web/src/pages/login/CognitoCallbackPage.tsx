import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { exchangeCognitoCode } from '../../api/auth';
import { useAuth } from '../../auth/AuthContext';
import { ErrorBanner } from '../../components/ui/ErrorBanner';
import { Spinner } from '../../components/ui/Spinner';

/**
 * Callback del flujo OAuth de Cognito (Hosted UI, authorization code).
 * Cognito redirige aquí con ?code=...; el SPA lo canjea en el backend
 * (que verifica el ID token vía JWKS), persiste la sesión y entra a la app.
 * El redirect_uri debe coincidir EXACTO con el registrado en el App Client.
 */
export function CognitoCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const done = useRef(false); // evita doble-canje en StrictMode

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const code = params.get('code');
    const oauthError = params.get('error');
    if (oauthError) {
      setError(new Error(`Cognito devolvió un error: ${oauthError}`));
      return;
    }
    if (!code) {
      setError(new Error('Falta el parámetro "code" en el callback de SSO'));
      return;
    }

    const redirectUri = `${window.location.origin}/auth/callback`;
    exchangeCognitoCode(code, redirectUri)
      .then(({ token, user }) => {
        setSession({ token, user });
        navigate('/tickets', { replace: true });
      })
      .catch(setError);
  }, [params, navigate, setSession]);

  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-slate-50 px-4 py-12">
      {error == null ? (
        <Spinner label="Completando inicio de sesión…" />
      ) : (
        <div className="w-full max-w-[440px] space-y-4">
          <ErrorBanner error={error} />
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-800"
          >
            ← Volver al inicio de sesión
          </button>
        </div>
      )}
    </div>
  );
}
