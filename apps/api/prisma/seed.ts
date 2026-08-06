import { hashPassword } from '../src/auth/password';
import { createPrismaClient } from '../src/prisma';

/*
 * Os dados de exemplo: o gestor e os três vendedores dos mockups.
 *
 * O CRM aberto pela primeira vez precisa se parecer com o desenho, então os
 * nomes daqui são os mesmos que aparecem nos cards e nas tabelas. Leads, Deals
 * e comentários entram nas fatias seguintes.
 *
 * O seed é idempotente (`upsert` por e-mail): rodá-lo duas vezes não duplica
 * ninguém e não derruba a `tokenVersion` de quem já está logado.
 */

const SEED_PASSWORD = 'kikos123';

const USERS = [
  { name: 'Rodrigo Ramos', email: 'rodrigo.ramos@kikos.com.br', role: 'MANAGER' },
  { name: 'Ana Paula Nogueira', email: 'ana.nogueira@kikos.com.br', role: 'SELLER' },
  { name: 'Caio Brida', email: 'caio.brida@kikos.com.br', role: 'SELLER' },
  { name: 'Maria da Silva', email: 'maria.silva@kikos.com.br', role: 'SELLER' },
] as const;

const prisma = createPrismaClient();

try {
  const passwordHash = await hashPassword(SEED_PASSWORD);

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      // Só o que identifica a pessoa é atualizado: `passwordHash` e
      // `tokenVersion` de quem já existe ficam como estão.
      update: { name: user.name, role: user.role },
      create: { ...user, passwordHash },
    });
  }

  console.log(`Seed: ${USERS.length} usuários. Senha de todos: ${SEED_PASSWORD}`);
} finally {
  await prisma.$disconnect();
}
