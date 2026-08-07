import {
  DealDetail,
  DealListItem,
  DealPage,
  DealTimeline,
  LeadDetail,
  LeadListItem,
  LeadPage,
} from '@kikos/domain';
import { expect } from '@effect/vitest';
import { Schema } from 'effect';
import type { TestHarness } from './harness';

/*
 * As leituras que mais de um arquivo de teste precisa fazer.
 *
 * Todas seguem a mesma regra, e é ela que justifica o módulo: **o teste acha o
 * registro pelo caminho que a tela acha**, e não espiando a fixture. O
 * formulário de negócio descobre o `leadId` pela busca da lista de contatos; o
 * board descobre o `id` de um card pelo próprio card. Um teste que fosse buscar
 * o identificador do outro lado da seam passaria mesmo com a consulta quebrada.
 *
 * Cada uma decodifica com o Schema compartilhado — o mesmo que o app web usa —,
 * então uma resposta fora do contrato falha aqui, com a queixa do Schema, e não
 * três asserções adiante.
 */

/** Um contato da carteira, achado pela busca da lista de Leads. */
export const leadNamed = async (
  harness: TestHarness,
  name: string,
): Promise<LeadListItem> => {
  const response = await harness.get(`/leads?search=${encodeURIComponent(name)}`);
  expect(response.statusCode).toBe(200);

  const lead = Schema.decodeUnknownSync(LeadPage)(response.json()).data.at(0);
  if (lead === undefined) throw new Error(`O contato "${name}" não está na carteira.`);
  return lead;
};

/** O contato inteiro, como o modal do Lead o lê. */
export const leadDetail = async (
  harness: TestHarness,
  id: string,
): Promise<LeadDetail> => {
  const response = await harness.get(`/leads/${id}`);
  expect(response.statusCode).toBe(200);

  return Schema.decodeUnknownSync(LeadDetail)(response.json());
};

/** Um negócio do funil, achado como o board o acha: pela busca. */
export const dealNamed = async (
  harness: TestHarness,
  title: string,
): Promise<DealListItem> => {
  const response = await harness.get(`/deals?search=${encodeURIComponent(title)}`);
  expect(response.statusCode).toBe(200);

  const deal = Schema.decodeUnknownSync(DealPage)(response.json()).data.at(0);
  if (deal === undefined) throw new Error(`O negócio "${title}" não está no funil.`);
  return deal;
};

/** O negócio inteiro, como o painel lateral e o modal o leem. */
export const dealDetail = async (
  harness: TestHarness,
  id: string,
): Promise<DealDetail> => {
  const response = await harness.get(`/deals/${id}`);
  expect(response.statusCode).toBe(200);

  return Schema.decodeUnknownSync(DealDetail)(response.json());
};

/** A linha do tempo de um negócio, do mais recente para o mais antigo. */
export const dealTimeline = async (
  harness: TestHarness,
  id: string,
): Promise<DealTimeline> => {
  const response = await harness.get(`/deals/${id}/comments`);
  expect(response.statusCode).toBe(200);

  return Schema.decodeUnknownSync(DealTimeline)(response.json());
};
