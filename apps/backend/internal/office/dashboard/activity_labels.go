package dashboard

import (
	"context"

	"github.com/kandev/kandev/internal/office/models"
)

// enrichActivityLabels resolves all names in bounded workspace-scoped reads.
// Activity rows are intentionally not joined one-by-one: the feed is a hot
// read path and historical identifiers must remain useful when a target was
// later removed.
func (s *DashboardService) enrichActivityLabels(
	ctx context.Context,
	workspaceID string,
	entries []*models.ActivityEntry,
	agents []*models.AgentInstance,
) {
	if len(entries) == 0 {
		return
	}
	if agents == nil && s.agents != nil {
		if listed, err := s.agents.ListAgentInstances(ctx, workspaceID); err == nil {
			agents = listed
		}
	}
	agentNames := make(map[string]string, len(agents))
	for _, agent := range agents {
		if agent != nil && agent.ID != "" {
			agentNames[agent.ID] = agent.Name
		}
	}

	needsTasks := false
	for _, entry := range entries {
		if entry != nil && entry.TargetType == models.ActivityTargetType("task") && entry.TargetID != "" {
			needsTasks = true
			break
		}
	}
	tasksByID := map[string]taskLabel{}
	if needsTasks {
		if tasks, err := s.repo.ListTasksByWorkspace(ctx, workspaceID, true); err == nil {
			for _, task := range tasks {
				if task != nil {
					tasksByID[task.ID] = taskLabel{Name: task.Title, Identifier: task.Identifier}
				}
			}
		}
	}

	for _, entry := range entries {
		if entry == nil {
			continue
		}
		if entry.ActorType == models.ActivityActorType("agent") {
			entry.ActorName = agentNames[entry.ActorID]
		}
		if label, ok := tasksByID[entry.TargetID]; ok {
			entry.TargetName = label.Name
			entry.TargetIdentifier = label.Identifier
		}
	}
}

type taskLabel struct {
	Name       string
	Identifier string
}
