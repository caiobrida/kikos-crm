/*
 * O lugar reservado das telas que ainda não existem.
 *
 * Esta fatia entrega login e a casca autenticada; Leads, board, Dashboard e
 * Vendedores vêm nas seguintes. Deixar cada item da barra lateral chegando a
 * uma tela que se apresenta é mais honesto que deixá-lo inerte.
 */
export interface ComingSoonPageProps {
  readonly title: string;
  readonly description: string;
}

export const ComingSoonPage = ({ title, description }: ComingSoonPageProps) => (
  <div className="mx-auto max-w-3xl px-8 py-10">
    <h1 className="text-2xl font-semibold text-ink">{title}</h1>
    <p className="mt-2 text-sm text-ink-muted">{description}</p>

    <div className="mt-8 rounded-card border border-dashed border-surface-600 px-6 py-10 text-center">
      <p className="text-sm text-ink-muted">Esta tela entra em breve.</p>
    </div>
  </div>
);
