import type { ReactNode } from 'react';

/**
 * O aviso de que alguma coisa não deu certo.
 *
 * Ele apareceu em cinco telas com a mesma tarja e o mesmo `role="alert"` antes de
 * virar componente, e é o `role` que justifica reuni-los: ele é o que faz um
 * leitor de tela anunciar a frase **sem que o foco vá até ela**, e é fácil de
 * esquecer em uma cópia nova. Aqui ele não tem como faltar.
 *
 * A frase é sempre a recusa em português — a do servidor, quando ela existe, ou a
 * que a tela sabe dizer quando nem resposta houve. Nunca a mensagem crua de um
 * erro: `"Failed to fetch"` é escrito para desenvolvedor, não para vendedor.
 */
export const Alert = ({ children }: { readonly children: ReactNode }) => (
  <p
    role="alert"
    className="rounded-lg bg-lost-500/10 px-3 py-2 text-sm text-lost-300 ring-1 ring-lost-500/30"
  >
    {children}
  </p>
);
