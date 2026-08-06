# Kikos CRM

CRM de vendas da Kikos Fitness: um time comercial registra contatos, abre negócios
sobre eles e acompanha esses negócios por um funil até ganhar ou perder.

## Language

### Pessoas

**User**:
Uma pessoa do time comercial com conta no CRM. É a única identidade do sistema —
tanto quem faz login quanto quem recebe leads e negócios.
_Avoid_: Account, duas entidades separadas para login e atribuição

**Role**:
O papel de um User: `MANAGER` (gestão, ex. Diretor de Vendas) ou `SELLER` (vendedor).
A tela "Vendedores" é a lista de Users com role `SELLER`.
_Avoid_: Permission, Perfil

**Seller (Vendedor)**:
Um User com role `SELLER`. É um papel, não uma entidade própria — não existe tabela `Seller`.
_Avoid_: Vendedor como entidade separada de User

**Owner (Vendedor Responsável)**:
O User a quem um Lead ou um Deal está atribuído. Todo Lead e todo Deal têm exatamente um Owner.
_Avoid_: Assignee, Responsável, Dono

### Comercial

**Lead**:
Um contato comercial — a pessoa e a empresa com quem se conversa. Existe independentemente
de haver negócio.
_Avoid_: Contact, Prospect, Cliente

**Source (Origem do Lead)**:
Por qual canal o Lead chegou ao time.
_Avoid_: Canal, Fonte, Origem (em nomes de código)

**Deal (Negócio)**:
Uma oportunidade de venda concreta sobre um Lead, com um valor. Um Lead pode ter vários Deals.
_Avoid_: Oportunidade, Venda, Proposta

**Pipeline (Funil)**:
A sequência ordenada de Stages pela qual um Deal caminha.
_Avoid_: Fluxo, Processo

**Stage (Estágio)**:
Onde o Deal está no Pipeline — a coluna do kanban. Diz respeito ao _andamento_ da negociação.
_Avoid_: Status (reservado para o Lead), Fase, Coluna

**Result (Resultado)**:
O desfecho do Deal: em aberto, ganho ou perdido. É ortogonal ao Stage — o Stage diz onde o
negócio está, o Result diz se ele terminou e como.
_Avoid_: Status, Outcome, Situação

**Status (do Lead)**:
A situação do relacionamento com o Lead, mostrada como badge na lista de leads.
Vocabulário distinto do Stage do Deal.
_Avoid_: Stage, Etapa

### Histórico

**Comment (Comentário)**:
Um registro no histórico de um Deal, sempre atribuído a um User. Existe em duas espécies,
distinguidas pelo `kind`: escrito por uma pessoa (`USER`) ou gerado pelo sistema ao registrar
uma ação (`SYSTEM`).
_Avoid_: Nota, Mensagem, Activity, Observação (reservado para o campo livre do Lead)

**Last Interaction (Última Interação)**:
O momento do último acontecimento relevante em um Lead ou Deal — criação, comentário,
mudança de Stage ou fechamento.
_Avoid_: Última Atualização, updatedAt
