import { z } from "zod";
import { AGENT_ADDITIONAL_INSTRUCTIONS_MAX_LENGTH } from "@shared/schema";

/**
 * Upper bound for the number of items a form can hold in an array field (selected tools, tags...).
 * The backend enforces no count limit on these lists, so this is only a generous safety cap that
 * keeps the schemas bounded (zod array validation is otherwise unbounded, CVE-2023-54404). It is
 * deliberately high enough that no real tenant should ever hit it.
 */
export const MAX_SELECTED_ITEMS = 1000;
export const MAX_SELECTED_ITEMS_MESSAGE = `You can select at most ${MAX_SELECTED_ITEMS} items`;

// Fields of an agent that the create form does not constrain further. Optional/nullable, as the
// create payload never has to supply them.
const optionalNullableString = z.string().nullable().optional();

/** Agent create form: required name/description/system prompt plus the optional agent fields. */
export const agentCreateFormSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  model: optionalNullableString,
  aiModelId: z.number().optional(),
  provider: optionalNullableString,
  apiKey: optionalNullableString,
  endpoint: optionalNullableString,
  systemPrompt: z.string().min(20, "System prompt must be at least 20 characters"),
  additionalInstructions: optionalNullableString,
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  isShared: z.boolean().optional(),
  enableSTM: z.boolean().default(false),
  enableLTM: z.boolean().default(false),
  enableSpinUpAgents: z.boolean().default(false),
  lastUpdatedOn: optionalNullableString,
  lastPublishedOn: optionalNullableString,
  type: optionalNullableString,
});

/** Tool create/edit form. */
export const toolFormSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  type: z.string(),
  config: z.string().min(2, "Configuration is required"),
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
  isShared: z.boolean().optional(),
  lastUpdatedOn: optionalNullableString,
  lastPublishedOn: optionalNullableString,
  tags: z.array(z.string()).max(MAX_SELECTED_ITEMS, MAX_SELECTED_ITEMS_MESSAGE).optional(),
  maxToolOutputLength: z.number().int().positive().nullable().optional(),
  permissionsEnabled: z.boolean().optional(),
});

/** Agent edit form (no behavior change from the schema formerly local to pages/agents/edit.tsx). */
export const agentEditFormSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  systemPrompt: z.string().min(20, "System prompt must be at least 20 characters"),
  additionalInstructions: z
    .string()
    .max(
      AGENT_ADDITIONAL_INSTRUCTIONS_MAX_LENGTH,
      `Additional instructions must be at most ${AGENT_ADDITIONAL_INSTRUCTIONS_MAX_LENGTH} characters`,
    ),
  aiModelId: z.number().optional(),
  provider: z.string().optional(),
  apiKey: z.string().optional(),
  endpoint: z.string().optional(),
  tools: z.array(z.number()).max(MAX_SELECTED_ITEMS, MAX_SELECTED_ITEMS_MESSAGE).optional(),
  enableSTM: z.boolean().default(false),
  enableLTM: z.boolean().default(false),
  enableSpinUpAgents: z.boolean().default(false),
});
