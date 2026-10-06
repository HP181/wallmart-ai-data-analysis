/**
 * Static facts about the deployment that more than one module needs.
 * Keeping them here means the agent, the health endpoint and the UI header
 * cannot drift apart.
 */

/** Model the analyst agent runs on (see agent/agent.ts). */
export const MODEL_ID = "gpt-4o";

/** The one table the analyst is allowed to read. */
export const TABLE_NAME = "walmart";
