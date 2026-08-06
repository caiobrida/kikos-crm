import { useEffect, useState } from 'react';

/**
 * O valor atrasado em `delayMs`, reiniciando a contagem a cada mudança.
 *
 * É o que separa "buscar enquanto se digita" de "uma requisição por tecla":
 * o `clearTimeout` da limpeza cancela o disparo agendado pela tecla anterior,
 * então só a última pausa de 300ms chega a virar consulta.
 *
 * `useEffect` com limpeza é a versão React do par agendar/cancelar: a função
 * devolvida roda antes do próximo efeito e na desmontagem, o que também evita
 * atualizar o estado de uma tela que o usuário já deixou.
 */
export const useDebouncedValue = <A>(value: A, delayMs: number): A => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
};
