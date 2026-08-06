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

- [ ] Clicar numa linha da tabela de Leads abre o modal com os dados do contato
- [ ] Editar um Lead reflete na tabela imediatamente
- [ ] Editar um Negócio reflete no board e no modal
- [ ] Editar um Negócio encerrado devolve 409 e a interface explica
- [ ] Remover pede confirmação antes de agir, sem abrir modal sobre modal
- [ ] Registro removido desaparece de todas as listagens, do board e do dashboard
- [ ] Remover um Lead com negócio em aberto devolve 409 com a contagem, e a interface diz quantos
- [ ] Remover um Lead cujos negócios estejam todos encerrados funciona
- [ ] Um Lead removido pode ser recadastrado com o mesmo e-mail
- [ ] Testes cobrem os dois bloqueios e que registro removido some das listagens

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
