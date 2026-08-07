import type { SVGProps } from 'react';

/*
 * Os poucos ícones que a navegação usa, como SVG inline.
 *
 * Sem biblioteca de ícones: são quatro traços, e uma dependência a menos é uma
 * dependência a menos. Todos herdam a cor do texto (`stroke="currentColor"`) e
 * são `aria-hidden` — o nome do item já está escrito ao lado.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'>;

const Icon = ({ children, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="size-5 shrink-0"
    {...props}
  >
    {children}
  </svg>
);

export const DashboardIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </Icon>
);

export const LeadsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M16 19v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V19" />
    <circle cx="9" cy="7" r="3.25" />
    <path d="M22 19v-1.5a4 4 0 0 0-3-3.87" />
    <path d="M16.5 4.13a4 4 0 0 1 0 5.74" />
  </Icon>
);

export const DealsIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3" y="4" width="5.5" height="12" rx="1.5" />
    <rect x="9.5" y="4" width="5.5" height="16" rx="1.5" />
    <rect x="16" y="4" width="5.5" height="8" rx="1.5" />
  </Icon>
);

export const SellersIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M5 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
  </Icon>
);

export const LogoutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 17l5-5-5-5" />
    <path d="M20 12H9" />
    <path d="M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
  </Icon>
);

/**
 * A marca de um registro de sistema na linha do tempo.
 *
 * Onde um comentário tem o avatar de quem escreveu, o registro de sistema tem
 * este ícone: é a distinção lida de relance, antes da cor e antes do texto. Duas
 * setas em ciclo — algo aconteceu com o negócio, e não alguém disse algo.
 */
export const SystemRecordIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5" />
    <path d="M20 4v4.5h-4.5" />
    <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.5" />
    <path d="M4 20v-4.5h4.5" />
  </Icon>
);

export const GoogleIcon = (props: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0" {...props}>
    <path
      fill="#4285F4"
      d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.44a5.5 5.5 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.56-5.15 3.56-8.8Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.87-3a7.2 7.2 0 0 1-10.72-3.78H1.4v3.1A12 12 0 0 0 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.36 14.3a7.1 7.1 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l3.96-3.1Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.43-3.43C17.95 1.2 15.24 0 12 0A12 12 0 0 0 1.4 6.6l3.96 3.1A7.16 7.16 0 0 1 12 4.77Z"
    />
  </svg>
);
