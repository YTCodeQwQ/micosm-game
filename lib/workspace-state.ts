export type MainWorkspaceView = "games" | "community" | "ranked" | "history";
export type WorkspacePanel = "world" | "friends" | "account" | null;
export type WorkspaceCommunityEntry = "discussion" | "announcements";
export type WorkspaceLobbyHall = "main" | "go" | "gomoku" | "reversi";

export type WorkspaceState = {
  version: 1;
  view: MainWorkspaceView;
  panel: WorkspacePanel;
  communityLive: boolean;
  communityEntry: WorkspaceCommunityEntry;
  lobbyHall: WorkspaceLobbyHall;
};

const views = new Set<MainWorkspaceView>(["games", "community", "ranked", "history"]);
const panels = new Set<Exclude<WorkspacePanel, null>>(["world", "friends", "account"]);
const communityEntries = new Set<WorkspaceCommunityEntry>(["discussion", "announcements"]);
const lobbyHalls = new Set<WorkspaceLobbyHall>(["main", "go", "gomoku", "reversi"]);

export const defaultWorkspaceState: WorkspaceState = {
  version: 1,
  view: "games",
  panel: null,
  communityLive: false,
  communityEntry: "discussion",
  lobbyHall: "main",
};

export function parseWorkspaceState(value: string | null, legacyView: string | null = null): WorkspaceState {
  let candidate: Partial<WorkspaceState> = {};
  try {
    candidate = value ? JSON.parse(value) as Partial<WorkspaceState> : {};
  } catch {
    candidate = {};
  }

  const fallbackView = views.has(legacyView as MainWorkspaceView)
    ? legacyView as MainWorkspaceView
    : defaultWorkspaceState.view;
  const view = views.has(candidate.view as MainWorkspaceView)
    ? candidate.view as MainWorkspaceView
    : fallbackView;
  const panel = candidate.panel && panels.has(candidate.panel as Exclude<WorkspacePanel, null>)
    ? candidate.panel as Exclude<WorkspacePanel, null>
    : null;

  return {
    version: 1,
    view,
    panel,
    communityLive: view === "community" && candidate.communityLive === true,
    communityEntry: communityEntries.has(candidate.communityEntry as WorkspaceCommunityEntry)
      ? candidate.communityEntry as WorkspaceCommunityEntry
      : defaultWorkspaceState.communityEntry,
    lobbyHall: lobbyHalls.has(candidate.lobbyHall as WorkspaceLobbyHall)
      ? candidate.lobbyHall as WorkspaceLobbyHall
      : defaultWorkspaceState.lobbyHall,
  };
}

export function serializeWorkspaceState(state: Omit<WorkspaceState, "version">) {
  return JSON.stringify({ version: 1, ...state } satisfies WorkspaceState);
}
