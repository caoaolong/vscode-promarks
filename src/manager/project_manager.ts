import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface Project {
  id: string;
  name: string;
  path: string;
  language: string;
  remark?: string;
  tags?: string[];
  lastOpened: number;
  // SSH Remote specific
  isRemote?: boolean;
  remoteHost?: string;
}

export class ProjectManager {
  private static readonly STORAGE_KEY = "vscode-promarks.projects";
  private static readonly TAGS_KEY = "vscode-promarks.tags";

  constructor(private context: vscode.ExtensionContext) {}

  public getProjects(): Project[] {
    const projects = this.context.globalState.get<Project[]>(
      ProjectManager.STORAGE_KEY,
      [],
    );
    // Sort by last opened, descending
    return projects.sort((a, b) => b.lastOpened - a.lastOpened);
  }

  public getProject(projectId: string): Project | undefined {
    return this.getProjects().find((p) => p.id === projectId);
  }

  public getTags(): string[] {
    return this.context.globalState.get<string[]>(ProjectManager.TAGS_KEY, []);
  }

  public async upsertTags(tags: string[]): Promise<void> {
    const current = this.getTags();
    const merged = this.mergeTags(current, tags);
    await this.context.globalState.update(ProjectManager.TAGS_KEY, merged);
  }

  public async addProject(folderPath: string): Promise<void> {
    const name = path.basename(folderPath);
    const language = await this.detectLanguage(folderPath);

    const newProject: Project = {
      id: folderPath, // Use path as ID for simplicity
      name: name,
      path: folderPath,
      language: language,
      remark: "",
      tags: [],
      lastOpened: Date.now(),
      isRemote: false,
    };

    await this.saveProject(newProject);
  }

  public async addRemoteProject(host: string, remotePath: string): Promise<void> {
    const name = path.basename(remotePath) || host;
    const newProject: Project = {
      id: `ssh://${host}${remotePath}`, // Unique ID for remote
      name: name,
      path: remotePath,
      language: "other",
      remark: `SSH: ${host}`,
      tags: [],
      lastOpened: Date.now(),
      isRemote: true,
      remoteHost: host,
    };
    await this.saveProject(newProject);
  }

  private async saveProject(project: Project): Promise<void> {
    const projects = this.getProjects();
    // Remove existing if present (to update it)
    const filtered = projects.filter(
      (p) => p.id !== project.id && p.path !== project.path,
    );
    filtered.push(project);
    await this.context.globalState.update(ProjectManager.STORAGE_KEY, filtered);
  }

  public async removeProject(projectId: string): Promise<void> {
    const projects = this.getProjects();
    const filtered = projects.filter((p) => p.id !== projectId);
    await this.context.globalState.update(ProjectManager.STORAGE_KEY, filtered);
  }

  public async updateLastOpened(projectId: string): Promise<void> {
    const projects = this.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      project.lastOpened = Date.now();
      // Re-save to persist order update
      const filtered = projects.filter((p) => p.id !== projectId);
      filtered.push(project);
      await this.context.globalState.update(
        ProjectManager.STORAGE_KEY,
        filtered,
      );
    }
  }

  public async updateProject(
    projectId: string,
    updates: { language?: string; remark?: string; tags?: string[] },
  ): Promise<void> {
    const projects = this.getProjects();
    const projectIndex = projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) {
      return;
    }

    const updated: Project = {
      ...projects[projectIndex],
      ...updates,
      tags: updates.tags ? this.normalizeTags(updates.tags) : projects[projectIndex].tags,
    };

    const nextProjects = projects.filter((p) => p.id !== projectId);
    nextProjects.push(updated);
    await this.context.globalState.update(ProjectManager.STORAGE_KEY, nextProjects);

    if (updates.tags) {
      await this.upsertTags(updates.tags);
    }
  }

  private async detectLanguage(folderPath: string): Promise<string> {
    try {
      const files = await fs.promises.readdir(folderPath);
      if (files.includes("pom.xml") || files.some((f) => f.endsWith(".java"))) {
        return "java";
      }
      if (
        files.includes("tsconfig.json") ||
        files.some((f) => f.endsWith(".ts"))
      ) {
        return "typescript";
      }
      if (
        files.includes("package.json") ||
        files.some((f) => f.endsWith(".js"))
      ) {
        return "javascript";
      }
      if (files.includes("go.mod") || files.some((f) => f.endsWith(".go"))) {
        return "go";
      }
      if (
        files.includes("requirements.txt") ||
        files.some((f) => f.endsWith(".py"))
      ) {
        return "python";
      }
      if (
        files.includes("Cargo.toml") ||
        files.some((f) => f.endsWith(".rs"))
      ) {
        return "rust";
      }
      if (
        files.some(
          (f) => f.endsWith(".cpp") || f.endsWith(".h") || f.endsWith(".c"),
        )
      ) {
        return "cpp";
      }
      if (files.some((f) => f.endsWith(".cs"))) {
        return "csharp";
      }
      return "other";
    } catch (error) {
      return "other";
    }
  }

  private normalizeTags(tags: string[]): string[] {
    return this.mergeTags([], tags);
  }

  private mergeTags(base: string[], extra: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    const pushTag = (tag: string) => {
      const trimmed = tag.trim();
      if (trimmed.length === 0) {
        return;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      result.push(trimmed);
    };

    for (const tag of base) {
      pushTag(tag);
    }
    for (const tag of extra) {
      pushTag(tag);
    }

    return result;
  }
}
