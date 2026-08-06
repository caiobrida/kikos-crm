import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ApiError } from '../lib/api';
import { useLogin, useSession } from '../lib/session';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { GoogleIcon } from '../ui/icons';

/** A rota de onde o usuário foi desviado pelo `RequireAuth`, se houver. */
interface LoginLocationState {
  readonly from?: string;
}

/** O erro de um campo específico, quando a API respondeu `ValidationFailed`. */
const issueFor = (error: unknown, path: string): string | undefined =>
  error instanceof ApiError
    ? error.issues.find((issue) => issue.path === path)?.message
    : undefined;

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useLogin();
  const session = useSession();
  const location = useLocation();

  const destination = (location.state as LoginLocationState | null)?.from ?? '/dashboard';

  // Quem já tem sessão válida não vê o formulário: entra direto. É o que faz a
  // sessão "continuar entre visitas" em vez de pedir senha a cada aba nova.
  if (session.data !== undefined) return <Navigate to={destination} replace />;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  /*
   * A mensagem geral só aparece quando o erro não é de campo — senão a mesma
   * queixa apareceria duas vezes na tela.
   */
  const fieldIssues = [issueFor(login.error, 'email'), issueFor(login.error, 'password')];
  const generalError =
    login.error !== null && fieldIssues.every((issue) => issue === undefined)
      ? login.error.message
      : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <p className="text-2xl font-bold tracking-tight text-ink">
            Kikos<span className="text-brand-500"> CRM</span>
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Entre para acompanhar seus contatos e negócios.
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex flex-col gap-5 rounded-card bg-surface-900 p-6 ring-1 ring-surface-700"
        >
          <Field
            htmlFor="login-email"
            label="E-mail"
            required
            {...(fieldIssues[0] === undefined ? {} : { error: fieldIssues[0] })}
          >
            <Input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="voce@kikos.com.br"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </Field>

          <Field
            htmlFor="login-password"
            label="Senha"
            required
            {...(fieldIssues[1] === undefined ? {} : { error: fieldIssues[1] })}
          >
            <Input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>

          {generalError !== undefined ? (
            /*
             * `role="alert"` faz o leitor de tela anunciar a recusa. Sem isso,
             * quem não enxerga a tela só descobre que nada aconteceu.
             */
            <p
              role="alert"
              className="rounded-lg bg-lost-500/10 px-3 py-2 text-sm text-lost-300 ring-1 ring-lost-500/30"
            >
              {generalError}
            </p>
          ) : null}

          <Button type="submit" isLoading={login.isPending} className="w-full">
            Entrar
          </Button>

          <div className="flex items-center gap-3 text-xs text-ink-faint">
            <span className="h-px flex-1 bg-surface-700" />
            ou
            <span className="h-px flex-1 bg-surface-700" />
          </div>

          {/*
            O botão do Google e o "esqueceu sua senha" existem no mockup, mas
            OAuth e recuperação de senha estão fora de escopo. Ficam desenhados
            e desabilitados, com o motivo no `title` — melhor que sumir com eles
            e melhor que fingir que funcionam.
          */}
          <Button
            variant="secondary"
            disabled
            title="Login via Google Workspace está fora do escopo deste projeto."
            leadingIcon={<GoogleIcon />}
            className="w-full"
          >
            Entrar com Google
          </Button>

          <p className="text-center text-sm text-ink-faint">
            <span title="A recuperação de senha está fora do escopo deste projeto.">
              Esqueceu sua senha?
            </span>
          </p>
        </form>
      </div>
    </main>
  );
};
