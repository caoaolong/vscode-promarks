import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface Project {
  id: string;
  name: string;
  path: string;
  language: string;
  remark?: string;
  lastOpened: number;
}

export class ProjectManager {
  private static readonly STORAGE_KEY = "vscode-promarks.projects";

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

  public async addProject(folderPath: string): Promise<void> {
    const name = path.basename(folderPath);
    const language = await this.detectLanguage(folderPath);

    const newProject: Project = {
      id: folderPath, // Use path as ID for simplicity
      name: name,
      path: folderPath,
      language: language,
      remark: "",
      lastOpened: Date.now(),
    };

    const projects = this.getProjects();
    // Remove existing if present (to update it)
    const filtered = projects.filter((p) => p.path !== folderPath);
    filtered.push(newProject);

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
    updates: { language?: string; remark?: string },
  ): Promise<void> {
    const projects = this.getProjects();
    const projectIndex = projects.findIndex((p) => p.id === projectId);
    if (projectIndex === -1) {
      return;
    }

    const updated: Project = {
      ...projects[projectIndex],
      ...updates,
    };

    const nextProjects = projects.filter((p) => p.id !== projectId);
    nextProjects.push(updated);
    await this.context.globalState.update(ProjectManager.STORAGE_KEY, nextProjects);
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
}
