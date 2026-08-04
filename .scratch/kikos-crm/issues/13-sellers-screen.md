# 13 — Tela de Vendedores (opcional)

**What to build:** o gestor abre "Vendedores" e vê quem pode receber Leads e Negócios, com
avatar, nome e e-mail, mais quantos contatos e quantos negócios em aberto estão sob
responsabilidade de cada um. Nenhum item da barra lateral fica inerte.

Fatia opcional: só construir se o restante estiver pronto e sobrar tempo.

**Blocked by:** 12

**Status:** ready-for-agent

**Branch:** `feat/sellers-screen`

- [ ] A tela lista os vendedores do seed com os avatares corretos
- [ ] As contagens batem com a lista de Leads e com o board
- [ ] Nenhum item da barra lateral fica inerte

## Decisões que valem lembrar

Somente leitura. Criar, editar e remover usuários está fora de escopo — os usuários vêm do seed.

O endpoint de vendedores já existe desde a fatia 03. Se ele precisar devolver as contagens, é uma
agregação a mais: avaliar se vale, ou deixar a tela só com os dados que já existem.

**Não vale segurar o projeto por esta fatia.**
