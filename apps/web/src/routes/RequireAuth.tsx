import { Navigate, Outlet, useLocation } from 'react-router';
import { CurrentUserContext } from '../lib/currentUser';
import { useSession } from '../lib/session';

const CheckingSession = () => (
  <div
    className="flex min-h-screen items-center justify-center"
    role="status"
    aria-live="polite"
  >
    <span
      aria-hidden="true"
      className="size-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent"
    />
    <span className="sr-only">Verificando sua sessão…</span>
  </div>
);

/**
 * O portão da área autenticada: nenhuma tela do CRM abre sem sessão válida.
 *
 * "Ter sessão" é uma pergunta ao servidor, não um valor guardado no navegador —
 * o token está num cookie `httpOnly` que o JavaScript da página não enxerga.
 * Enquanto a resposta não chega, nem o CRM nem o login aparecem: mostrar o
 * formulário para quem já está logado seria piscar uma tela errada.
 */
export const RequireAuth = () => {
  const session = useSession();
  const location = useLocation();

  if (session.isPending) return <CheckingSession />;

  if (session.data === undefined) {
    // `state.from` leva a pessoa de volta ao que ela tentou abrir, depois de
    // entrar — em vez de despejá-la sempre no Dashboard.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  return (
    <CurrentUserContext.Provider value={session.data}>
      <Outlet />
    </CurrentUserContext.Provider>
  );
};
