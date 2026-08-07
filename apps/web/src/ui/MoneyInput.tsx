import { useState } from 'react';
import { formatBRL, parseBRL } from '../lib/money';
import { Input } from './Field';

/**
 * O campo de dinheiro: o vendedor digita reais, o formulário guarda centavos.
 *
 * **É a borda em que as duas unidades se encontram**, e ela é estreita de
 * propósito: o texto digitado é estado deste componente e não sai daqui; para
 * fora vai o inteiro em centavos que o Schema compartilhado valida e que
 * trafega no JSON.
 *
 * O texto precisa ser estado próprio, e não derivado do valor: formatar a cada
 * tecla brigaria com quem está digitando — o cursor pularia de lugar e "12,"
 * viraria "R$ 12,00" antes de a pessoa terminar. A formatação acontece na saída
 * do campo, quando não há mais nada a digitar.
 *
 * `NaN` é como o campo diz "está em branco, ou tem texto que não é valor
 * nenhum". Não é um valor de conveniência: é o que faz a recusa ser escrita
 * pelo Schema — a mesma frase que a API usaria —, em vez de por uma mensagem
 * inventada aqui.
 */
export interface MoneyInputProps {
  readonly id: string;
  /** O valor em centavos, ou `NaN` enquanto não há um valor legível. */
  readonly value: number;
  readonly onChange: (valueInCents: number) => void;
  readonly onBlur?: () => void;
}

/** O valor como texto do campo — vazio enquanto não há valor nenhum. */
const toText = (valueInCents: number): string =>
  Number.isFinite(valueInCents) ? formatBRL(valueInCents) : '';

export const MoneyInput = ({ id, value, onChange, onBlur }: MoneyInputProps) => {
  const [text, setText] = useState(() => toText(value));

  return (
    <Input
      id={id}
      // `inputMode="decimal"` levanta o teclado numérico no celular sem virar
      // um `type="number"`, que recusaria a vírgula em teclado brasileiro.
      inputMode="decimal"
      placeholder="12.500,00"
      autoComplete="off"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseBRL(event.target.value) ?? Number.NaN);
      }}
      onBlur={() => {
        // Sair do campo devolve o valor formatado, que é a prova visível de
        // como ele foi entendido. Texto que não é valor nenhum fica como está,
        // para que a pessoa veja o que escreveu junto da queixa.
        const parsed = parseBRL(text);
        if (parsed !== null) setText(formatBRL(parsed));
        onBlur?.();
      }}
    />
  );
};
