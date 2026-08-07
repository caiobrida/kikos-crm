import { Schema } from 'effect';
import { CommentKind, type DealStage } from './enums';
import { CommentId } from './ids';
import { DEAL_STAGE_LABELS } from './pipeline';
import { RequiredText } from './text';
import { UserSummary } from './user';

/**
 * Um registro da linha do tempo de um Deal.
 *
 * As duas espécies do vocabulário — escrito por uma pessoa e gerado pelo sistema
 * — são **o mesmo Schema**, distinguidas por `kind`. A tela lê a espécie para
 * decidir como desenhar cada item; nada mais no CRM se importa com ela.
 *
 * **Todo registro tem autor, inclusive o de sistema.** Não é firula do mockup: a
 * frase "Estágio alterado de Novo para Proposta enviada" só responde "quem
 * moveu?" se o autor vier junto, e é essa pergunta que o gestor faz ao
 * reconstituir uma negociação. Por isso `author` não é opcional aqui, e a coluna
 * correspondente não é nulável no banco.
 *
 * O `dealId` **não** está no Schema de leitura: a linha do tempo é sempre pedida
 * por negócio (`GET /deals/:id/comments`), e repetir o mesmo identificador em
 * cada item seria dizer de novo o que a rota já disse.
 */
export const Comment = Schema.Struct({
  id: CommentId,
  kind: CommentKind,
  body: Schema.String,
  author: UserSummary,
  /** `Schema.DateFromString`: string ISO no JSON, `Date` no código. */
  createdAt: Schema.DateFromString,
});

export type Comment = typeof Comment.Type;
export type CommentEncoded = typeof Comment.Encoded;

/**
 * A linha do tempo de um negócio — o que `GET /deals/:id/comments` responde.
 *
 * Uma lista, e não uma página: o histórico de um negócio é curto por natureza
 * (dezenas de itens, não milhares), e ele é lido inteiro de uma vez porque a
 * pergunta que se faz ao abrir o detalhamento é "o que já rolou aqui?", não "o
 * que rolou nos últimos dez eventos". Se um dia o volume mudar isso, o envelope
 * `Paginated` já existe e a troca é local.
 *
 * Vem **do mais recente para o mais antigo**: é a ordem em que a tela desenha, e
 * é o que faz o comentário recém-escrito aparecer no topo sem que o navegador
 * precise reordenar nada.
 */
export const DealTimeline = Schema.Array(Comment);
export type DealTimeline = typeof DealTimeline.Type;

/**
 * O corpo de `POST /deals/:id/comments` — e a caixa de comentário do
 * detalhamento.
 *
 * Um campo só: o negócio vem do caminho, o autor vem da sessão e o momento vem
 * do relógio do servidor. Nenhum dos três existe aqui, pelo mesmo motivo de
 * sempre — um campo que não está no Schema não tem como ser escolhido pelo corpo
 * da requisição, e ninguém comenta em nome de outra pessoa.
 *
 * `kind` também não está: um comentário enviado pela API é, por definição,
 * escrito por uma pessoa. Registro de sistema nasce de uma ação do domínio, e
 * não de uma requisição.
 */
export const CreateCommentInput = Schema.Struct({
  body: RequiredText('Escreva o comentário antes de enviar.', 2000),
});

export type CreateCommentInput = typeof CreateCommentInput.Type;
export type CreateCommentInputEncoded = typeof CreateCommentInput.Encoded;

/**
 * O texto do registro de sistema que uma mudança de estágio deixa.
 *
 * Pura, e no pacote compartilhado, pelo mesmo motivo que `STAGE_MOVE_REFUSALS`:
 * a frase gravada no banco usa os mesmos nomes de estágio que o cabeçalho da
 * coluna mostra. Escrevê-la solta dentro da rota abriria a porta para a linha do
 * tempo dizer "PROPOSAL_SENT" enquanto o board diz "Proposta enviada".
 *
 * O corpo é gravado **pronto**, e não montado na leitura a partir de campos
 * estruturados. É registro histórico: se o rótulo de um estágio mudar amanhã, o
 * que aconteceu ontem continua descrito com as palavras de ontem — e nenhuma
 * leitura precisa saber interpretar espécie de evento para desenhar a lista.
 */
export const stageMoveRecord = (from: DealStage, to: DealStage): string =>
  `Estágio alterado de ${DEAL_STAGE_LABELS[from]} para ${DEAL_STAGE_LABELS[to]}.`;
