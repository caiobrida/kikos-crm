import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './layout/AppShell';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DealsBoardPage } from './pages/DealsBoardPage';
import { LeadsPage } from './pages/LeadsPage';
import { LoginPage } from './pages/LoginPage';
import { PrimitivesPage } from './pages/PrimitivesPage';
import { RequireAuth } from './routes/RequireAuth';

/*
 * O mapa de rotas.
 *
 * Tudo que não é `/login` fica dentro do `RequireAuth`, e não é cada tela que
 * confere a sessão: o portão é um só, na raiz da árvore autenticada. Uma tela
 * nova acrescentada aqui dentro nasce protegida, sem que ninguém precise
 * lembrar de protegê-la.
 */
export const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />

    <Route element={<RequireAuth />}>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />

        <Route
          path="/dashboard"
          element={
            <ComingSoonPage
              title="Dashboard"
              description="O valor parado em cada Stage do funil, o comparativo por vendedor e a tabela de negócios."
            />
          }
        />

        <Route path="/leads" element={<LeadsPage />} />

        <Route path="/negocios" element={<DealsBoardPage />} />

        <Route
          path="/vendedores"
          element={
            <ComingSoonPage
              title="Vendedores"
              description="Quem pode receber Leads e Negócios, com avatar, nome e e-mail."
            />
          }
        />

        {/* A vitrine da fatia 01. Fora da barra lateral: é referência de
            desenvolvimento, não tela do produto. */}
        <Route path="/primitivas" element={<PrimitivesPage />} />
      </Route>
    </Route>

    {/* Qualquer outro caminho cai na raiz, que decide entre CRM e login. */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
