import type { SessionUser } from '@kikos/domain';
import { createContext, useContext } from 'react';

/*
 * O User logado, publicado pelo `RequireAuth` para tudo que roda dentro da
 * área autenticada.
 *
 * Poderia ser `useSession().data` em cada tela, mas ali o tipo é
 * `SessionUser | undefined` — e uma tela que só existe atrás do `RequireAuth`
 * não deveria precisar tratar o caso "sem usuário". O contexto troca esse
 * `undefined` por uma garantia.
 */
export const CurrentUserContext = createContext<SessionUser | null>(null);

export const useCurrentUser = (): SessionUser => {
  const user = useContext(CurrentUserContext);

  if (user === null) {
    throw new Error('useCurrentUser foi chamado fora de uma rota protegida.');
  }

  return user;
};
