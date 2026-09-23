/**
 * Opaque durable keys of the channel Session consumer's three storage domains.
 * A key is composed by its domain's own writer and never parsed by a client.
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Identifies one conversation binding record. */
export type ChannelBindingKey = Branded<'ChannelBindingKey'>

/** Identifies one refused message awaiting an approval decision. */
export type ChannelPendingRequestKey = Branded<'ChannelPendingRequestKey'>

/** Identifies one outbound delivery record. */
export type ChannelDeliveryKey = Branded<'ChannelDeliveryKey'>
