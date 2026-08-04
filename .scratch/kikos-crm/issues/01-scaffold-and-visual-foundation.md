# 01 — Esqueleto, fundação visual, infra local e CI

**What to build:** quem clona o repositório consegue instalar tudo com um comando, subir o
Postgres com outro, e ver os dois apps rodando. A identidade visual do produto — fundo escuro,
laranja como cor de ação, verde para ganho, vermelho para perdido — já existe como base, junto
com as peças que todas as telas vão reusar: botão, campo, selo de status, avatar com iniciais,
casca de modal e casca de tabela. Cada push roda qualidade de código e testes.

Esta é a única fatia que não entrega comportamento de usuário. Ela existe para que as doze
seguintes não precisem reinventar tema e primitivas.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

**Branch:** `chore/scaffold-and-visual-foundation`

- [x] `npm install` na raiz instala todos os workspaces de uma vez
- [x] `docker compose up -d` sobe o Postgres e ele aceita conexão
- [x] O app web sobe e serve uma página; a API sobe e responde numa rota de saúde
- [x] O pacote de domínio é importável pelos dois apps com os tipos resolvidos, sem passo de
      build manual em desenvolvimento
- [x] O Vite proxia `/api` para a API, deixando tudo same-origin em desenvolvimento
- [x] Lint, verificação de formatação, verificação de tipos e testes passam localmente
- [x] O workflow do GitHub Actions roda esses quatro passos em push e pull request, sem serviço
      de banco
- [x] Uma página de demonstração das primitivas mostra as peças nas suas variações
- [x] Depois de instalar e subir tudo, `git status` fica limpo
- [x] `git check-ignore .env.example` não retorna nada — ver nota abaixo
- [x] O README explica como rodar

## Decisões que valem lembrar

**O pacote de domínio é browser-safe desde o primeiro commit.** Nada que toque Node, Prisma ou
I/O entra nele. Registrar a regra no README antes que alguém a quebre.

**`.gitignore`:** a raiz carrega tudo que é transversal — o padrão do git já é recursivo, então
`node_modules/` na raiz cobre todos os workspaces. Não repetir as mesmas linhas por pacote:
duplicar gera divergência quando alguém corrige um lugar e esquece o outro.

```gitignore
# dependências
node_modules/

# ambiente — a negação precisa vir depois do padrão
.env
.env.*
!.env.example

# saída de build
dist/
build/
*.tsbuildinfo

# testes
coverage/

# logs
*.log
npm-debug.log*

# editor e sistema operacional
.DS_Store
Thumbs.db
desktop.ini
.idea/
.vscode/
```

Arquivo por pacote **apenas** para o que aquele pacote gera de único: `apps/web` (cache e
artefatos locais do Vite) e, condicionalmente, `apps/api` — só se o Prisma for configurado com
caminho de saída customizado para o client. Na saída padrão ele cai em `node_modules` e a raiz
já resolve.

**Precisa estar versionado**, os três esquecimentos clássicos: `prisma/migrations/` (sem elas
ninguém reproduz o banco), o `package-lock.json` único na raiz, e o `.env.example`.

Vão para o git normalmente: `CLAUDE.md`, `CONTEXT.md`, `docs/adr/`, `docs/agents/` e `.scratch/`.

## Comments

**Sobre o critério do `git check-ignore -v`.** Com o `.gitignore` acima — que é o desta issue —
`git check-ignore -v .env.example` **imprime** `.gitignore:7:!.env.example`. É o comportamento
documentado do `-v`: ele mostra o último padrão que casou com o caminho, inclusive quando esse
padrão é uma negação. Não dá para o `-v` ficar mudo enquanto existir a dupla `.env.*` +
`!.env.example`, porque o arquivo casa com o primeiro padrão de qualquer jeito.

O que a intenção do critério pede está verificado pela forma sem `-v`:

```
$ git check-ignore .env.example   # sem saída, exit 1 → não é ignorado
$ git add --dry-run .env.example  # add '.env.example'
$ git add --dry-run .env          # recusado: "paths are ignored by one of your .gitignore"
```

