import { NavLink } from 'react-router';
import { cn } from '../lib/cn';
import { useCurrentUser } from '../lib/currentUser';
import { USER_ROLE_LABELS } from '../lib/labels';
import { useLogout } from '../lib/session';
import { Avatar } from '../ui/Avatar';
import {
  DashboardIcon,
  DealsIcon,
  LeadsIcon,
  LogoutIcon,
  SellersIcon,
} from '../ui/icons';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { to: '/leads', label: 'Leads', Icon: LeadsIcon },
  { to: '/negocios', label: 'Negócios', Icon: DealsIcon },
  { to: '/vendedores', label: 'Vendedores', Icon: SellersIcon },
] as const;

/**
 * A barra lateral fixa, com o User logado no rodapé.
 *
 * O rodapé responde a uma pergunta prática: "com qual conta eu estou?". Num CRM
 * em que qualquer User autenticado altera tudo, saber quem você é antes de
 * mexer num negócio alheio importa.
 */
export const Sidebar = () => {
  const user = useCurrentUser();
  const logout = useLogout();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-surface-800 bg-surface-900">
      <div className="px-5 py-6">
        <p className="text-lg font-bold tracking-tight text-ink">
          Kikos<span className="text-brand-500"> CRM</span>
        </p>
      </div>

      <nav aria-label="Navegação principal" className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <li key={to}>
              {/*
                `NavLink` recebe do próprio roteador se a rota está ativa, o que
                dispensa comparar `location.pathname` na mão. O `aria-current`
                acompanha, para que o destaque não seja só visual.
              */}
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-brand-500/10 text-brand-300'
                      : 'text-ink-muted hover:bg-surface-800 hover:text-ink',
                  )
                }
              >
                <Icon />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex items-center gap-3 border-t border-surface-800 px-4 py-4">
        <Avatar name={user.name} />

        <div className="min-w-0 flex-1">
          {/* O nome é cortado quando não cabe na barra; o `title` devolve o
              inteiro ao passar o mouse. */}
          <p title={user.name} className="truncate text-sm font-medium text-ink">
            {user.name}
          </p>
          <p className="truncate text-xs text-ink-muted">{USER_ROLE_LABELS[user.role]}</p>
        </div>

        <button
          type="button"
          onClick={() => {
            logout.mutate();
          }}
          disabled={logout.isPending}
          aria-label="Sair"
          title="Sair"
          className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-800 hover:text-ink disabled:opacity-50"
        >
          <LogoutIcon />
        </button>
      </div>
    </aside>
  );
};
