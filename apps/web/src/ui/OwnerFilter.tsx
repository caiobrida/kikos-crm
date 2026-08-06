import type { SessionUser } from '@kikos/domain';
import { Select } from './Field';

/**
 * O filtro "todos os responsáveis", que toda tela de listagem do CRM tem.
 *
 * É o mesmo controle na lista de Leads e no board de Negócios — e será o mesmo
 * no dashboard. Existir uma vez é o que garante que o rótulo acessível, a opção
 * "todos" e o comportamento de campo vazio não passem a divergir entre telas
 * conforme uma delas for ajustada.
 *
 * A lista de vendedores entra por prop, e não é buscada aqui: as primitivas
 * desta pasta desenham, quem consulta é a tela. Cada uma já tem o `useSellers`
 * por outros motivos.
 */
export interface OwnerFilterProps {
  readonly id: string;
  readonly sellers: readonly SessionUser[];
  /** O identificador escolhido, ou `''` para "todos". */
  readonly value: string;
  readonly onChange: (ownerId: string) => void;
}

export const OwnerFilter = ({ id, sellers, value, onChange }: OwnerFilterProps) => (
  <>
    <label htmlFor={id} className="sr-only">
      Filtrar por responsável
    </label>

    <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Todos os responsáveis</option>
      {sellers.map((seller) => (
        <option key={seller.id} value={seller.id}>
          {seller.name}
        </option>
      ))}
    </Select>
  </>
);
