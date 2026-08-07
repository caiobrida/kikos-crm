# 08 — Painel lateral, modal de detalhes e linha do tempo

**What to build:** o vendedor clica num card e um painel lateral abre com o resumo do negócio,
sem tirá-lo do board. Um botão nesse painel abre um modal quase de tela cheia com o detalhamento:
os dados do negócio, o dossiê do cliente com telefone e e-mail do Lead, e a linha do tempo de
atividades. Ele escreve um comentário e ele aparece no topo da linha do tempo, com autor e
horário. O que o sistema registrou é visualmente distinto do que uma pessoa escreveu.

O modal tem endereço próprio: recarregar a página mantém ele aberto, o botão voltar do navegador
o fecha, e o link pode ser mandado para um colega.

**Blocked by:** 07

**Status:** ready-for-agent

**Branch:** `feat/deal-detail-modal`

- [x] Clicar num card abre o painel lateral; o botão do painel abre o modal
- [x] Recarregar a página com o modal aberto mantém o modal aberto
- [x] O botão voltar do navegador fecha o modal e devolve ao board
- [x] O modal mostra o dossiê do cliente com os dados do Lead vinculado
- [x] Comentar faz o comentário aparecer no topo da linha do tempo, com autor e horário
- [x] Registros de sistema são visualmente distintos dos comentários escritos
- [x] Mover um card passa a deixar registro de sistema na linha do tempo
- [x] Comentar atualiza a última interação do negócio e do Lead
- [x] Testes cobrem que comentar atualiza a última interação e que mover gera registro de sistema

## Decisões que valem lembrar

Esta fatia é dona do conceito **linha do tempo** por inteiro: a entidade, as duas espécies de
registro, a leitura e a escrita. O caso de uso de movimentação escrito na fatia 07 ganha aqui a
dependência do repositório de comentários e passa a registrar o evento — os testes daquela fatia
ganham uma Layer a mais no setup.

**Comentário tem a chave do negócio obrigatória.** Uma FK não-nulável em vez de chaves nuláveis
ou par tipo/id: o banco garante a integridade e nenhuma leitura precisa desambiguar alvo. Lead
não recebe comentários — tem campo de observações.

As duas espécies convivem na mesma tabela, distinguidas por um campo: escrito por pessoa ou
gerado pelo sistema. Ambas sempre têm autor — inclusive as de sistema, como nos mockups.

**O painel lateral é enxuto e só de leitura:** título, valor, selo de estágio, Lead, responsável,
última interação, e o botão. Os comentários não ficam nele — estão no modal. Como o painel não
age, não há lógica duplicada nem cache para invalidar em dois lugares. Se painel e modal usarem
a mesma chave de cache, o modal abre sem novo carregamento.

**Modal com endereço próprio** é o que separa um modal bem-feito de um improviso: a rota do
negócio renderiza o board com o modal por cima.

A camada de comentários deve ficar isolada e fácil de consumir — é onde a integração de IA se
pluga numa fase futura.

Seed com comentários na linha do tempo, reproduzindo os mockups.
