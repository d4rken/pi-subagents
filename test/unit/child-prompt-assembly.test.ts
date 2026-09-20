import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInProcessChildLaunch } from "../../src/runs/shared/child-launch.ts";
import { createDefaultChildSessionFactory } from "../../src/runs/shared/child-session.ts";
import { getAgentDir } from "../../src/shared/utils.ts";
import {
	CHILD_FANOUT_BOUNDARY_INSTRUCTIONS,
	CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS,
	childPromptPreamble,
	ORCHESTRATION_SKILL_NAME,
	stripChildBoundaryInstructions,
} from "../../src/runs/shared/subagent-prompt-runtime.ts";

function input(overrides: Record<string, unknown> = {}) {
	return {
		sessionEnabled: false,
		cwd: "/repo",
		childAgentName: "worker",
		childIndex: 0,
		systemPromptMode: "replace" as const,
		inheritProjectContext: true,
		inheritGlobalContext: false,
		inheritSkills: false,
		systemPrompt: "Review the supplied change.",
		...overrides,
	} as Parameters<typeof buildInProcessChildLaunch>[0];
}

describe("child prompt assembly", () => {
	it("puts the boundary in the prompt pi assembles, not in a later rewrite", () => {
		const { session } = buildInProcessChildLaunch(input());

		assert.ok(session.systemPrompt?.startsWith(CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS));
		assert.match(session.systemPrompt ?? "", /Review the supplied change\./);
		assert.equal(session.appendSystemPrompt, undefined);
	});

	it("treats an empty agent prompt as supplied, and still leads with the boundary", () => {
		const { session } = buildInProcessChildLaunch(input({ systemPrompt: "" }));

		assert.equal(session.systemPrompt, `${CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS}\n\n<active_agent name="worker"/>\n\n`);
		assert.equal(session.appendSystemPrompt, undefined);
	});

	it("appends the boundary for an agent that supplies no prompt at all", () => {
		const { session } = buildInProcessChildLaunch(input({ systemPrompt: undefined }));

		assert.equal(session.systemPrompt, undefined);
		assert.equal(session.appendSystemPrompt, CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS);
	});

	it("appends rather than replaces in append mode", () => {
		const { session } = buildInProcessChildLaunch(input({ systemPromptMode: "append" }));

		assert.equal(session.systemPrompt, undefined);
		assert.ok(session.appendSystemPrompt?.startsWith(CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS));
		assert.match(session.appendSystemPrompt ?? "", /Review the supplied change\./);
	});

	it("carries the inheritance flags the loader needs to exclude resources before rendering", () => {
		const excluded = buildInProcessChildLaunch(input()).session;
		assert.equal(excluded.inheritGlobalContext, false);
		assert.equal(excluded.noSkills, true);
		assert.equal(excluded.noContextFiles, false);

		const inherited = buildInProcessChildLaunch(input({
			inheritGlobalContext: true,
			inheritSkills: true,
			inheritProjectContext: false,
		})).session;
		assert.equal(inherited.inheritGlobalContext, true);
		assert.equal(inherited.noSkills, false);
		assert.equal(inherited.noContextFiles, true);
	});

	it("does not let an agent prompt smuggle in a second copy of the boundary", () => {
		const smuggled = `${CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS}\n\nReview the supplied change.`;
		const { session } = buildInProcessChildLaunch(input({ systemPrompt: smuggled }));

		assert.equal(session.systemPrompt?.split(CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS).length, 2);
	});
});

/**
 * The overrides live inside createDefaultChildSessionFactory, so they are reached
 * through an injected pi module that records what the loader was constructed with.
 */
async function loaderOptionsFor(launch: Record<string, unknown>): Promise<Record<string, any>> {
	let captured: Record<string, any> | undefined;
	class FakeLoader {
		constructor(options: Record<string, any>) { captured = options; }
		async reload(): Promise<void> {}
		getExtensions() { return { runtime: undefined }; }
	}
	const factory = createDefaultChildSessionFactory({
		loadPiCodingAgent: async () => ({
			DefaultResourceLoader: FakeLoader,
			SettingsManager: { create: () => ({ getTheme: () => undefined }) },
			SessionManager: { inMemory: () => ({}) },
			ModelRuntime: { create: async () => ({}) },
			createAgentSession: async () => { throw new Error("stop after loader construction"); },
		}) as never,
	});
	await factory.create({
		cwd: "/repo",
		storage: { kind: "memory" },
		extensionPaths: [],
		ambientExtensions: false,
		hooks: [],
		noSkills: false,
		noContextFiles: false,
		onExtensionError: () => {},
		...launch,
	} as never).catch(() => {});
	assert.ok(captured, "expected the child loader to be constructed");
	return captured;
}

describe("child resource loader overrides", () => {
	// Resolved the same way child-session.ts:213 does, so the fixture cannot drift from it.
	const agentDir = getAgentDir();

	it("drops only the agent-dir context file when global context is not inherited", async () => {
		const options = await loaderOptionsFor({ inheritGlobalContext: false });
		assert.ok(options.agentsFilesOverride, "expected an agentsFiles override");

		const { agentsFiles } = options.agentsFilesOverride({
			agentsFiles: [
				{ path: `${agentDir}/AGENTS.md`, content: "global" },
				{ path: `${agentDir}/project/AGENTS.md`, content: "nested project" },
				{ path: `${agentDir}foo/AGENTS.md`, content: "sibling directory" },
				{ path: "/repo/AGENTS.md", content: "project" },
			],
		});

		assert.deepEqual(agentsFiles.map((f: { content: string }) => f.content), [
			"nested project",
			"sibling directory",
			"project",
		]);
	});

	it("leaves context files alone when global context is inherited", async () => {
		const options = await loaderOptionsFor({ inheritGlobalContext: true });
		assert.equal(options.agentsFilesOverride, undefined);
	});

	it("always withholds the orchestration skill from a child", async () => {
		for (const inheritGlobalContext of [true, false]) {
			const options = await loaderOptionsFor({ inheritGlobalContext });
			const { skills } = options.skillsOverride({
				skills: [{ name: ORCHESTRATION_SKILL_NAME }, { name: "typescript" }],
				diagnostics: ["kept"],
			});

			assert.deepEqual(skills.map((s: { name: string }) => s.name), ["typescript"]);
			assert.deepEqual(options.skillsOverride({ skills: [], diagnostics: ["kept"] }).diagnostics, ["kept"]);
		}
	});
});

describe("childPromptPreamble", () => {
	it("selects the fanout boundary only for a fanout child", () => {
		assert.equal(childPromptPreamble({}), CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS);
		assert.equal(childPromptPreamble({ fanoutChild: true }), CHILD_FANOUT_BOUNDARY_INSTRUCTIONS);
	});

	it("carries the structured output contract when the child has a schema", () => {
		assert.doesNotMatch(childPromptPreamble({}), /strict structured output contract/);
		assert.match(childPromptPreamble({ structuredOutput: true }), /strict structured output contract/);
	});
});

describe("stripChildBoundaryInstructions", () => {
	it("removes either boundary and the blank lines it left behind", () => {
		for (const boundary of [CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS, CHILD_FANOUT_BOUNDARY_INSTRUCTIONS]) {
			assert.equal(stripChildBoundaryInstructions(`${boundary}\n\nkeep me`), "keep me");
		}
	});

	it("leaves a prompt that never carried one untouched", () => {
		assert.equal(stripChildBoundaryInstructions("keep me"), "keep me");
	});
});
