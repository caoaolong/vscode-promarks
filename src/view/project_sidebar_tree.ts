import * as vscode from "vscode";
import { ProjectManager, Project } from "../manager/project_manager";
import {
  addRemoteProjectFlow,
  deletePromarksProject,
  editPromarksProject,
  importCurrentWorkspaceFolder,
  openPromarksProject,
} from "../project_actions";

const UNTAGGED_LABEL = "未分类";

export type SidebarTreeNode = TagGroupItem | ProjectItem;

export class TagGroupItem extends vscode.TreeItem {
  constructor(
    public readonly tagTitle: string,
    public readonly projects: Project[],
    isUntagged = false,
  ) {
    super(tagTitle, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "promarksTag";
    this.iconPath = new vscode.ThemeIcon(isUntagged ? "folder" : "tag");
  }
}

export class ProjectItem extends vscode.TreeItem {
  constructor(public readonly project: Project) {
    super(project.name, vscode.TreeItemCollapsibleState.None);
    this.tooltip = project.isRemote
      ? `SSH: ${project.remoteHost ?? ""}\n${project.path}`
      : project.path;
    this.description = project.isRemote ? project.remoteHost : undefined;
    this.contextValue = "promarksProject";
    this.iconPath = new vscode.ThemeIcon(
      ProjectSidebarTreeProvider.themeIconForLanguage(project.language),
    );
  }
}

export class ProjectSidebarTreeProvider
  implements vscode.TreeDataProvider<SidebarTreeNode>
{
  constructor(
    private readonly projectManager: ProjectManager,
    private readonly mode: "local" | "remote",
  ) {}

  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    SidebarTreeNode | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SidebarTreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: SidebarTreeNode): SidebarTreeNode[] {
    if (!element) {
      return this.buildRootNodes();
    }
    if (element instanceof TagGroupItem) {
      return element.projects.map((p) => new ProjectItem(p));
    }
    return [];
  }

  private filterProjects(): Project[] {
    const all = this.projectManager.getProjects();
    if (this.mode === "local") {
      return all.filter((p) => !p.isRemote);
    }
    return all.filter((p) => p.isRemote === true);
  }

  private buildRootNodes(): TagGroupItem[] {
    const projects = this.filterProjects();
    const byTag = new Map<string, Project[]>();
    const untagged: Project[] = [];

    for (const p of projects) {
      const tags = Array.isArray(p.tags)
        ? p.tags.map((t) => t.trim()).filter((t) => t.length > 0)
        : [];
      if (tags.length === 0) {
        untagged.push(p);
        continue;
      }
      for (const t of tags) {
        const list = byTag.get(t) ?? [];
        if (!list.some((x) => x.id === p.id)) {
          list.push(p);
        }
        byTag.set(t, list);
      }
    }

    const orderedTagNames = this.mergeTagOrder(this.projectManager.getTags(), [
      ...byTag.keys(),
    ]);

    const nodes: TagGroupItem[] = [];
    for (const name of orderedTagNames) {
      const list = byTag.get(name) ?? [];
      nodes.push(new TagGroupItem(name, list));
    }

    if (untagged.length > 0) {
      nodes.push(new TagGroupItem(UNTAGGED_LABEL, untagged, true));
    }

    return nodes;
  }

  private mergeTagOrder(registry: string[], fromProjects: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    const push = (raw: string) => {
      const t = raw.trim();
      if (t.length === 0) {
        return;
      }
      const key = t.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(t);
    };
    for (const t of registry) {
      push(t);
    }
    for (const t of [...fromProjects].sort((a, b) => a.localeCompare(b))) {
      push(t);
    }
    return result.sort((a, b) => a.localeCompare(b));
  }

  static themeIconForLanguage(language: string): string {
    switch (language.toLowerCase()) {
      case "python":
        return "python";
      case "java":
        return "symbol-class";
      case "javascript":
      case "typescript":
        return "file-code";
      case "go":
        return "go-to-file";
      case "rust":
        return "gear";
      case "cpp":
        return "file-binary";
      case "csharp":
        return "symbol-class";
      default:
        return "root-folder";
    }
  }
}

function isProjectItem(x: SidebarTreeNode | undefined): x is ProjectItem {
  return x instanceof ProjectItem;
}

export function registerProjectSidebar(
  context: vscode.ExtensionContext,
  projectManager: ProjectManager,
  onDataChanged: () => void,
): void {
  const localProvider = new ProjectSidebarTreeProvider(projectManager, "local");
  const remoteProvider = new ProjectSidebarTreeProvider(projectManager, "remote");

  const refreshAll = () => {
    localProvider.refresh();
    remoteProvider.refresh();
    onDataChanged();
  };

  context.subscriptions.push(
    vscode.window.createTreeView("vscode-promarks-local-projects", {
      treeDataProvider: localProvider,
      showCollapseAll: true,
    }),
  );
  context.subscriptions.push(
    vscode.window.createTreeView("vscode-promarks-remote-projects", {
      treeDataProvider: remoteProvider,
      showCollapseAll: true,
    }),
  );

  const withProject = (
    item: SidebarTreeNode | undefined,
    fn: (p: Project) => void | Promise<void>,
  ) => {
    if (!isProjectItem(item)) {
      return;
    }
    void Promise.resolve(fn(item.project));
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-promarks.sidebar.openHere",
      (node: SidebarTreeNode | undefined) => {
        withProject(node, (p) =>
          openPromarksProject(projectManager, p, false).then(() => refreshAll()),
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-promarks.sidebar.openNewWindow",
      (node: SidebarTreeNode | undefined) => {
        withProject(node, (p) =>
          openPromarksProject(projectManager, p, true).then(() => refreshAll()),
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-promarks.sidebar.editProject",
      (node: SidebarTreeNode | undefined) => {
        withProject(node, (p) =>
          editPromarksProject(projectManager, p.id, refreshAll),
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "vscode-promarks.sidebar.deleteProject",
      (node: SidebarTreeNode | undefined) => {
        withProject(node, (p) =>
          deletePromarksProject(projectManager, p.id, refreshAll),
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-promarks.sidebar.importLocalWorkspace", () =>
      importCurrentWorkspaceFolder(projectManager, refreshAll),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-promarks.sidebar.importRemoteProject", () =>
      addRemoteProjectFlow(projectManager, refreshAll),
    ),
  );
}
