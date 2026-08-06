# 04 — Cadastrar Lead

**What to build:** o vendedor preenche o formulário "Criar Novo Lead" com nome, empresa, e-mail,
telefone, origem e responsável — mais cargo e observações, se quiser — e o contato passa a
existir na lista. Campo obrigatório em branco ou e-mail malformado são apontados junto do campo,
antes de qualquer ida ao servidor.

O mesmo Schema valida o formulário no navegador e a requisição na API. Não existem duas regras.

**Blocked by:** 03

**Status:** ready-for-agent

**Branch:** `feat/create-lead`

- [ ] Salvar um Lead válido o faz aparecer na lista imediatamente
- [ ] Enviar sem campo obrigatório mostra o erro no campo, sem chamar a API
- [ ] E-mail malformado é recusado com mensagem clara
- [ ] A seleção de responsável é alimentada pelo endpoint de vendedores
- [ ] Um responsável inexistente devolve 404 e a tela mostra o erro sem quebrar
- [ ] Um Lead recém-criado nasce com status "Novo" e última interação no momento da criação
- [ ] Cancelar volta para a lista sem salvar

## Decisões que valem lembrar

Este é o ponto onde "TypeScript ponta a ponta" deixa de ser slogan: o Schema do pacote
compartilhado alimenta o formulário via resolver e valida a rota. Vale um comentário explicando
que `Schema` faz o papel de um Zod, com a diferença de também descrever a transformação entre a
forma que trafega e a forma do domínio.

Campos obrigatórios pelo mockup: nome, empresa, e-mail, telefone, origem e responsável.
Opcionais: cargo e observações.
