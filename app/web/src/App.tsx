import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, RequireAuth, RequireRole } from './auth/AuthContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/login/LoginPage';
import { QueuePage } from './pages/queue/QueuePage';
import { CreateTicketPage } from './pages/create/CreateTicketPage';
import { TicketDetailPage } from './pages/detail/TicketDetailPage';
import { SlaPage } from './pages/sla/SlaPage';
import { ReportsPage } from './pages/reports/ReportsPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Pública */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protegidas (requieren sesión) */}
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Navigate to="/tickets" replace />} />
            <Route path="/tickets" element={<QueuePage />} />
            <Route path="/tickets/nuevo" element={<CreateTicketPage />} />
            <Route path="/tickets/:id" element={<TicketDetailPage />} />
            <Route
              path="/sla"
              element={
                <RequireRole roles={['agente', 'administrador']}>
                  <SlaPage />
                </RequireRole>
              }
            />
            <Route
              path="/reports"
              element={
                <RequireRole roles={['administrador']}>
                  <ReportsPage />
                </RequireRole>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/tickets" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
