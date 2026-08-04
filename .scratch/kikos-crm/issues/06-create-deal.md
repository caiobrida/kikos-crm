# 06 — Cadastrar Negócio

**What to build:** o vendedor preenche "Cadastrar Novo Negócio" informando nome, valor estimado,
responsável e estágio inicial, e vincula o negócio a um Lead já cadastrado buscando pelo nome.
Pode informar data prevista de fechamento e descrição do escopo. Ao salvar, o card aparece na
coluna correspondente do board — e o Lead vinculado passa a aparecer como "Contato" na lista de
Leads.

**Blocked by:** 05

**Status:** ready-for-agent

**Branch:** `feat/create-deal`

- [ ] Criar um negócio o faz aparecer na coluna correta do board
- [ ] O campo de Lead busca entre os contatos cadastrados pelo nome
- [ ] O responsável vem pré-preenchido com o dono do Lead escolhido, e pode ser trocado
- [ ] Criar um negócio move o status do Lead vinculado para "Contato" na lista de Leads
- [ ] Criar com Lead ou responsável inexistente devolve 404
- [ ] Escolher "Fechado" como estágio inicial é recusado com 422
- [ ] Campo obrigatório em branco é apontado no campo, sem chamar a API

## Decisões que valem lembrar

**O estágio inicial só pode ser um dos quatro abertos.** `CLOSED` não é destino de escolha nem
de movimentação — só se chega nele marcando ganho ou perdido (ADR-0003). A regra que valida isso
é pura e vive no pacote compartilhado, então o formulário nem oferece a opção e a rota recusa
quem tentar por fora.

**O status do Lead é sincronizado pelo domínio**, com a regra "último evento vence": criar um
negócio para o Lead o move para "Contato". As demais transições chegam nas fatias 07 e 09.

O responsável do negócio pode ser diferente do dono do Lead — o formulário só pré-preenche,
para cobrir o caso em que quem prospecta não é quem fecha.
