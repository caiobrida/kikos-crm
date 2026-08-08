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

**Workload (Carga)**:
Quantos Leads e quantos Deals em aberto estão sob responsabilidade de um User — os dois números
que a tela "Vendedores" mostra ao lado de cada pessoa. É contagem derivada, nunca coluna: ninguém
escreve uma carga, ela é o que sobra de contar por Owner.
_Avoid_: Carteira (em nomes de código), Capacidade, Meta

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

**Board (Quadro)**:
O Pipeline visto como kanban: uma coluna por Stage, cada uma com os Deals que estão nele e o
total real da coluna. É a leitura do funil inteiro numa ida ao servidor, e não uma listagem
paginada — um kanban não tem "página 2".
_Avoid_: Kanban (em nomes de código), Quadro (idem)

**Dossier (Dossiê)**:
Os dados do Lead mostrados dentro do detalhamento de um Deal — nome, empresa, telefone, e-mail
e Owner. Existe para que o vendedor ligue sem trocar de tela, e continua legível mesmo depois
de o Lead ser removido.
_Avoid_: Cliente, Ficha, Perfil

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

**Timeline (Linha do Tempo)**:
A sequência de Comments de um Deal, do mais recente para o mais antigo. É registro histórico:
Comment não é editável nem removível, e um registro de sistema não pode ser apagado.
_Avoid_: Histórico (em nomes de código), Feed, Log

**Last Interaction (Última Interação)**:
O momento do último acontecimento relevante em um Lead ou Deal — criação, comentário,
mudança de Stage ou fechamento.
_Avoid_: Última Atualização, updatedAt
