import { expect, test } from "../../fixtures/office-fixture";

type RoutineRun = {
  id: string;
  linked_task_id?: string;
  status: string;
};

async function routineRuns(
  officeApi: { listRoutineRuns(id: string): Promise<Record<string, unknown>> },
  id: string,
) {
  const result = await officeApi.listRoutineRuns(id);
  return (Array.isArray(result.runs) ? result.runs : []) as RoutineRun[];
}

test.describe("Office taskless routine sessions", () => {
  test("fires a real taskless routine twice without creating task rows", async ({
    officeApi,
    apiClient,
    officeSeed,
  }) => {
    const before = await apiClient.listTasks(officeSeed.workspaceId);
    const routine = await officeApi.createRoutine(officeSeed.workspaceId, {
      name: `Taskless E2E ${Date.now()}`,
      description: "Taskless routine session smoke test",
    });
    const routineId = routine.id as string;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await officeApi.runRoutine(routineId);
      expect(response.status).toBe(200);
      await expect
        .poll(() => routineRuns(officeApi, routineId), { timeout: 20_000 })
        .toHaveLength(attempt);
    }

    const runs = await routineRuns(officeApi, routineId);
    expect(runs.every((run) => !run.linked_task_id)).toBe(true);
    expect(new Set(runs.map((run) => run.id)).size).toBe(2);

    const after = await apiClient.listTasks(officeSeed.workspaceId);
    expect(after.tasks.map((task) => task.id)).toEqual(before.tasks.map((task) => task.id));
  });
});
