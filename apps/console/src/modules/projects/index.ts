export { BoardScreen } from "./components/board-screen";
export { NewTaskDialog } from "./components/new-task-dialog";
export { ProjectRedirect } from "./components/project-redirect";
export { StatusIcon } from "./components/status-icon";
export { useWorkspace, WorkspaceProvider } from "./context/workspace-context";
export { groupByStatus } from "./lib/board";
export { projectsService } from "./services/projects.service";
export { TASK_STATUS_LABELS, TASK_STATUSES } from "./types/project.types";
export type { Project, Task, TaskStatus } from "./types/project.types";
