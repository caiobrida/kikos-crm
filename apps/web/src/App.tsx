import { Navigate, Route, Routes } from 'react-router';
import { AppShell } from './layout/AppShell';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { DashboardPage } from './pages/DashboardPage';
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

        <Route path="/dashboard" element={<DashboardPage />} />

        <Route path="/leads" element={<LeadsPage />} />

        <Route path="/negocios" element={<DealsBoardPage />} />

        {/*
          O detalhamento de um negócio é um modal, **e uma rota**: a mesma tela
          de board responde por este caminho e desenha o modal por cima. É o que
          faz recarregar manter o modal aberto, o botão voltar fechá-lo, e o
          link ser compartilhável — sem que o funil deixe de estar por trás.
        */}
        {/*
          **Um negócio, um endereço.** A tabela do dashboard abre o detalhamento
          por este mesmo caminho, e não por um `/dashboard/:dealId` paralelo: o
          link que alguém manda a um colega tem de ser um só, e duas rotas para o
          mesmo registro seriam duas respostas para "qual é o endereço deste
          negócio?".
        */}
        <Route path="/negocios/:dealId" element={<DealsBoardPage />} />

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
