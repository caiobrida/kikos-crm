import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';

/** A moldura de toda tela autenticada: barra lateral fixa e conteúdo rolável. */
export const AppShell = () => (
  <div className="flex min-h-screen">
    <Sidebar />

    <main className="min-w-0 flex-1 overflow-y-auto">
      <Outlet />
    </main>
  </div>
);
