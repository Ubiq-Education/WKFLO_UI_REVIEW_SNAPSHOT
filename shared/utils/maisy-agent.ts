// MAISY conversations (US 7505 / 7506 / 7507 / 7550): the MAISY-only chat UI is gated on this one
// helper - the chat configuration's `isMaisyAgent`, server-derived from the agent's "Maisy" tag.
// `canSelectFeature` comes from the same tag but only controls the Select feature button.
export interface MaisyAgentFlags {
  isMaisyAgent?: boolean;
}

export function isMaisyAgent(config: MaisyAgentFlags): boolean {
  return config.isMaisyAgent === true;
}
