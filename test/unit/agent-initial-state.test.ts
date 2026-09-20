import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { initialAgentState } from "../../src/shared/agent-initial-state.ts";

/**
 * Both branches are covered here because only one of them can run against the
 * installed pi: the suite resolves whichever pi-ai the lockfile pins, so the
 * branch for the other version would otherwise ship unexercised.
 */
describe("initialAgentState", () => {
	const tools = [{ name: "read" }, { name: "grep" }];

	it("builds a message list when pi-ai supplies the builders", () => {
		const state = initialAgentState("be careful", tools, {
			toToolDeclaration: (tool) => `declared:${tool.name}`,
			createInitialSystemMessage: (prompt, declarations) => ({ prompt, declarations }),
		});

		assert.deepEqual(state, {
			messages: [{ prompt: "be careful", declarations: ["declared:read", "declared:grep"] }],
		});
	});

	it("falls back to a system prompt when pi-ai has neither builder", () => {
		assert.deepEqual(initialAgentState("be careful", tools, {}), { systemPrompt: "be careful" });
	});

	it("falls back when only one builder is present", () => {
		const half = { createInitialSystemMessage: () => ({ unexpected: true }) };
		assert.deepEqual(initialAgentState("be careful", tools, half), { systemPrompt: "be careful" });

		const other = { toToolDeclaration: (tool: { name: string }) => tool.name };
		assert.deepEqual(initialAgentState("be careful", tools, other), { systemPrompt: "be careful" });
	});

	it("passes every tool through the declaration builder, in order", () => {
		const seen: string[] = [];
		initialAgentState("p", tools, {
			toToolDeclaration: (tool) => { seen.push(tool.name); return tool.name; },
			createInitialSystemMessage: (prompt, declarations) => ({ prompt, declarations }),
		});

		assert.deepEqual(seen, ["read", "grep"]);
	});
});
