import { Link } from 'react-router';
import { useCurrentUser } from '../lib/currentUser';

/*
 * O lugar reservado das telas que ainda não existem.
 *
 * Esta fatia entrega login e a casca autenticada; Leads, board, Dashboard e
 * Vendedores vêm nas seguintes. Deixar os itens da barra lateral levando a uma
 * página que diz o que virá é mais honesto que deixá-los inertes ou escondê-los.
 */
export interface ComingSoonPageProps {
  readonly title: string;
  readonly description: string;
  /** A fatia que constrói esta tela, como consta no rastreador de issues. */
  readonly slice: string;
}

export const ComingSoonPage = ({ title, description, slice }: ComingSoonPageProps) => {
  const user = useCurrentUser();

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <h1 className="text-2xl font-semibold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{description}</p>

      <div className="mt-8 rounded-card border border-dashed border-surface-600 px-6 py-10 text-center">
        <p className="text-sm text-ink-muted">
          Esta tela é construída na fatia <strong className="text-ink">{slice}</strong>.
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          Você está autenticado como {user.name} — as telas do CRM entram por cima desta
          casca.
        </p>
        <p className="mt-4 text-xs text-ink-faint">
          Enquanto isso, a{' '}
          <Link to="/primitivas" className="text-brand-400 underline underline-offset-2">
            vitrine das primitivas
          </Link>{' '}
          mostra as peças que essas telas vão reusar.
        </p>
      </div>
    </div>
  );
};
