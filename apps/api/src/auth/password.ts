import bcrypt from 'bcryptjs';
import { config } from '../config';

/*
 * O hash de senha.
 *
 * `bcryptjs` e não `argon2` por um motivo prático: é JavaScript puro. `argon2`
 * é binding nativo e exigiria toolchain de compilação na máquina de quem clona
 * o repositório para avaliá-lo.
 *
 * Não é um `Context.Tag`: a única substituição do projeto é a camada de
 * repositório (mais o `Clock` do Effect). Trocar bcrypt por um duble nos testes
 * esconderia justamente o que o teste de senha errada precisa exercitar.
 */

export const hashPassword = async (plainText: string): Promise<string> =>
  bcrypt.hash(plainText, config.auth.bcryptRounds);

/**
 * Compara a senha digitada com o hash gravado.
 *
 * `bcrypt.compare` já é resistente a ataque de tempo na comparação do hash, e
 * devolve `false` — em vez de estourar — quando o hash gravado é inválido.
 */
export const verifyPassword = async (
  plainText: string,
  passwordHash: string,
): Promise<boolean> => bcrypt.compare(plainText, passwordHash);
