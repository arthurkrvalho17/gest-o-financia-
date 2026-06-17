import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import Login from './auth/Login';
import Layout from './components/Layout';
import EstoquePage from './modules/estoque/EstoquePage';
import PreparacaoPage from './modules/preparacao/PreparacaoPage';
import CrmPage from './modules/crm/CrmPage';
import FinanceiroPage from './modules/financeiro/FinanceiroPage';
import ContratosPage from './modules/contratos/ContratosPage';

function Carregando() {
  return (
    <div className="min-h-screen grid place-items-center bg-bg text-muted text-[13px]">
      Carregando…
    </div>
  );
}

export default function App() {
  const { session, carregando } = useAuth();

  if (carregando) return <Carregando />;

  // Sem sessão: só a tela de login.
  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // Logado: app com sidebar e os módulos.
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/estoque" replace />} />
        <Route path="/estoque" element={<EstoquePage />} />
        <Route path="/preparacao" element={<PreparacaoPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/financeiro" element={<FinanceiroPage />} />
        <Route path="/contratos" element={<ContratosPage />} />
        <Route path="*" element={<Navigate to="/estoque" replace />} />
      </Route>
    </Routes>
  );
}
