import { SessionUser, type LoginRequestEncoded } from '@kikos/domain';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { apiJson, apiSend } from './api';

/*
 * A sessão, do ponto de vista do app web.
 *
 * Não há token em `localStorage` para guardar: ele vive num cookie `httpOnly`,
 * invisível para o JavaScript da página. "Estou logado?" é, portanto, uma
 * pergunta ao servidor — `GET /auth/me` — e o cache do TanStack Query é o que
 * evita repeti-la a cada navegação.
 */

export const sessionQueryKey = ['session'] as const;

export const useSession = () =>
  useQuery({
    queryKey: sessionQueryKey,
    queryFn: ({ signal }) => apiJson(SessionUser, '/auth/me', { signal }),
    /*
     * Sem repetição: um 401 é resposta definitiva, não instabilidade de rede.
     * O wrapper de fetch já tentou renovar a sessão antes de deixar o erro
     * chegar até aqui.
     */
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

export const useLogin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credentials: LoginRequestEncoded) =>
      apiJson(SessionUser, '/auth/login', {
        method: 'POST',
        body: credentials,
        skipRefresh: true,
      }),
    // Guardar o User que o login devolveu evita um `GET /auth/me` redundante
    // logo depois de entrar.
    onSuccess: (user) => {
      queryClient.setQueryData(sessionQueryKey, user);
    },
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => apiSend('/auth/logout', { method: 'POST' }),
    /*
     * `onSettled` e não `onSuccess`: se o servidor recusou o logout porque a
     * sessão já tinha caído, o certo continua sendo levar para o login.
     *
     * Sair da árvore protegida antes de limpar o cache evita que a tela ainda
     * montada refaça `GET /auth/me` só para tomar 401.
     */
    onSettled: () => {
      void navigate('/login', { replace: true });
      queryClient.clear();
    },
  });
};
