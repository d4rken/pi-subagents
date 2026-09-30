import assert from "node:assert/strict";
import { it } from "node:test";
import { formatScheduleStatus } from "../../src/tui/schedule-status.ts";

it("keeps the nearest armed schedule visible with its exact due time and scope", () => {
	const late = { id: "late", name: "Late check", cwd: "/project", nextRunAt: "2030-01-01T01:00:00.000Z" };
	const early = { ...late, id: "watch", name: "Log watch", sessionOnly: true, nextRunAt: "2030-01-01T00:05:00.000Z" };
	assert.equal(formatScheduleStatus([late, early]), "Schedules: 2 armed here · Log watch · due 2030-01-01T00:05:00.000Z · session-only · /subagents-stop");
	assert.match(formatScheduleStatus([late])!, / · project · /);
	assert.equal(formatScheduleStatus([]), undefined);
});

it("bounds and sanitizes schedule names before publishing status", () => {
	const status = formatScheduleStatus([{ id: "watch", name: "\u001b[31mAlert\n" + "🙂".repeat(100), cwd: "/project", nextRunAt: "2030-01-01T00:05:00.000Z" }])!;
	assert.doesNotMatch(status, /[\u001b\n]/);
	assert.ok(status.length < 180);
	assert.match(status, /Alert /);
	assert.match(status, /\.\.\./);
});
