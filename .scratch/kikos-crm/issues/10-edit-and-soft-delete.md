# 10 — Editar e remover Lead e Negócio

**What to build:** o vendedor corrige o telefone de um contato ou o valor de um negócio sem
recadastrar, e remove o que cadastrou por engano. Ambos acontecem dentro do modal daquele
registro: um botão troca o conteúdo pelo formulário, e a remoção pede confirmação no rodapé do
próprio modal.

Duas proteções: remover um contato que tenha negócio em aberto é bloqueado, com o sistema
dizendo quantos travam a operação — o funil não perde dinheiro porque alguém limpou a lista de
contatos. E um negócio já encerrado não pode ser editado, pelo mesmo princípio que impede
movê-lo.

**Blocked by:** 04, 09

**Status:** ready-for-agent

**Branch:** `feat/edit-and-soft-delete`

- [x] Clicar numa linha da tabela de Leads abre o modal com os dados do contato
- [x] Editar um Lead reflete na tabela imediatamente
- [x] Editar um Negócio reflete no board e no modal
- [x] Editar um Negócio encerrado devolve 409 e a interface explica
- [x] Remover pede confirmação antes de agir, sem abrir modal sobre modal
- [x] Registro removido desaparece de todas as listagens, do board e do dashboard
- [x] Remover um Lead com negócio em aberto devolve 409 com a contagem, e a interface diz quantos
- [x] Remover um Lead cujos negócios estejam todos encerrados funciona
- [x] Um Lead removido pode ser recadastrado com o mesmo e-mail
- [x] Testes cobrem os dois bloqueios e que registro removido some das listagens

## Decisões que valem lembrar

**Remoção é lógica**, gravando o momento em vez de apagar a linha. O filtro que exclui removidos
mora na camada de repositório, nunca nas rotas — auditar as consultas já existentes e garantir
que todas passem por ele. É a decisão que elimina a classe inteira de bug "registro apagado
reaparece numa tela que esqueceu o `where`", e merece teste explícito.

Esta fatia vem depois dos Negócios por dependência real: a regra que impede remover um Lead com
negócio em aberto não é implementável antes de existir Negócio, e a que recusa editar negócio
encerrado precisa que encerrar exista.

A edição recebe a carga completa editável, espelhando o formulário, o que permite validar a
requisição inteira com um Schema só e reusar o formulário de criação.

Lead e Negócio seguem o mesmo padrão de interação, e o padrão de remoção lógica é estabelecido
uma vez e aplicado aos dois.

**Comentários continuam sem edição nem remoção:** a linha do tempo é registro histórico, e um
registro de sistema não pode sumir.

## Comments

**Decisões tomadas durante a implementação**

- **`PUT /deals/:id` não recebe o estágio.** Mover já é uma ação, com rota própria
  (`PATCH /deals/:id/stage`), regra própria e três consequências que a edição não tem: o registro
  na linha do tempo, a última interação e o selo do contato. Deixá-lo entrar na carga da edição
  seria um segundo caminho até a mesma escrita — um que a coluna do board não consulta e que o
  histórico não registra. `UpdateDealInput` é derivado de `CreateDealInput` com `Struct.omit`, e
  `PUT /leads/:id` recebe a carga do cadastro inteira (`UpdateLeadInput` **é**
  `CreateLeadInput`).
- **Editar não avança a última interação nem mexe no status do Lead.** A lista dos
  acontecimentos que a avançam está no spec — criação, comentário, mudança de estágio e
  fechamento — e editar não está nela. Um card que subisse ao topo da coluna por causa de um
  ajuste de digitação mentiria sobre onde a negociação está viva.
- **Remover um Negócio encerrado é permitido.** ADR-0003 recusa as três escritas que *mudam o
  desfecho* de um negócio encerrado — mover, editar e encerrar de novo. Retirar o registro
  inteiro não é uma delas, e um negócio cadastrado por engano e encerrado por engano junto
  precisa poder sair do funil.
- **A contagem de negócios que travam a remoção vai na mensagem**, e não num campo à parte do
  corpo de erro: mantém um formato só para todo erro da API. A frase mora no domínio
  (`leadHasOpenDealsMessage`), como as recusas do funil.
- **Remover um Lead não remove os negócios dele.** Os que sobraram estão encerrados, e apagá-los
  levaria embora o histórico de vendas ganhas junto com a limpeza de um cadastro. O `JOIN` do
  card continua enxergando o contato removido, então um negócio ganho continua sabendo de quem
  era.
