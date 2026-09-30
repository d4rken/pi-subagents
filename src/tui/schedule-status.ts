import type { ArmedSchedule } from "../runs/background/scheduled-runs.ts";
import { previewDisplayText } from "../shared/display-text.ts";

export const SCHEDULE_STATUS_KEY = "subagent-schedules";

export function formatScheduleStatus(schedules: ArmedSchedule[]): string | undefined {
	const next = schedules.reduce<ArmedSchedule | undefined>((earliest, schedule) =>
		!earliest || schedule.nextRunAt < earliest.nextRunAt ? schedule : earliest, undefined);
	if (!next) return undefined;
	return `Schedules: ${schedules.length} armed here · ${previewDisplayText(next.name, 48)} · due ${next.nextRunAt} · ${next.sessionOnly ? "session-only" : "project"} · /subagents-stop`;
}
