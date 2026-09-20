import * as piAi from "@earendil-works/pi-ai";

/**
 * The seed of an `Agent`'s initial state for the installed pi.
 *
 * Pi 0.86 replaced `initialState.systemPrompt` with a pre-built message list and
 * moved the builders for it into pi-ai. Importing those builders by name is a
 * load-time `SyntaxError` on 0.85.x, which takes the whole extension down before
 * any of it runs, so they are reached through the namespace instead and the older
 * shape is produced when they are absent.
 *
 * Remove this together with the 0.85.x floor.
 */
export interface PiAiMessageApi<Tool> {
	createInitialSystemMessage?: (prompt: string, declarations: unknown[]) => unknown;
	toToolDeclaration?: (tool: Tool) => unknown;
}

export function initialAgentState<Tool>(
	systemPrompt: string,
	tools: Tool[],
	/** Overridden only by tests, which must cover both installed pi versions. */
	api: PiAiMessageApi<Tool> = piAi as PiAiMessageApi<Tool>,
): Record<string, unknown> {
	const { createInitialSystemMessage, toToolDeclaration } = api;
	if (!createInitialSystemMessage || !toToolDeclaration) return { systemPrompt };
	return { messages: [createInitialSystemMessage(systemPrompt, tools.map((tool) => toToolDeclaration(tool)))] };
}
