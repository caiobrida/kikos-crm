import { Schema } from 'effect';

/*
 * Os identificadores do domínio. Todos são UUID no banco, mas cada um recebe
 * uma *marca* (brand) diferente no Schema.
 *
 * Sem marca, `UserId` e `LeadId` seriam os dois `string` e o compilador
 * deixaria passar `findLead(user.id)`. `Schema.UUID.pipe(Schema.brand('UserId'))`
 * produz o tipo `string & Brand<'UserId'>`: em TypeScript comum seria
 * `type UserId = string & { readonly __brand: 'UserId' }`, com a diferença de
 * que aqui a marca só é aplicada por quem valida o valor — não dá para
 * inventar um `UserId` a partir de uma string qualquer sem passar pelo Schema.
 */

/** O identificador de um User. */
export const UserId = Schema.UUID.pipe(Schema.brand('UserId'));
export type UserId = typeof UserId.Type;

/** O identificador de um Lead. */
export const LeadId = Schema.UUID.pipe(Schema.brand('LeadId'));
export type LeadId = typeof LeadId.Type;
