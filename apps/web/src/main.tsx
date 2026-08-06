import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App';
import './index.css';

/*
 * O TanStack Query é o cache de tudo que vem da API. Aqui ficam só os defaults
 * que valem para o app inteiro; cada consulta ajusta o que precisa.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /*
       * Sem repetição automática: as recusas desta API são definitivas — 401 é
       * sessão inválida, 400 é campo errado. Repetir três vezes só atrasaria a
       * mensagem que a pessoa precisa ler. O wrapper de fetch já cuida do único
       * caso que vale reprocessar, que é renovar a sessão e refazer a chamada.
       */
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Elemento #root não encontrado em index.html');
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
