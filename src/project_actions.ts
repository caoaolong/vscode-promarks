import * as vscode from "vscode";
import { ProjectManager, Project } from "./manager/project_manager";

const LANGUAGE_OPTIONS = [
  "python",
  "java",
  "go",
  "javascript",
  "typescript",
  "rust",
  "cpp",
  "csharp",
  "other",
] as const;

/** 从 SSH Remote 工作区 URI 解析主机与远程路径；非 SSH 远程则返回 undefined */
export function parseSshRemoteFolder(
  uri: vscode.Uri,
): { host: string; remotePath: string } | undefined {
  if (uri.scheme !== "vscode-remote" || !uri.authority.startsWith("ssh-remote+")) {
    return undefined;
  }
  return {
    host: uri.authority.slice("ssh-remote+".length),
    remotePath: uri.path,
  };
}

export async function pickLanguageWithDetected(detected: string): Promise<string | undefined> {
  const ordered = [detected, ...LANGUAGE_OPTIONS.filter((l) => l !== detected)];
  const picked = await vscode.window.showQuickPick(
    ordered.map((l) => ({
      label: l,
      description: l === detected ? "自动检测" : undefined,
    })),
    { placeHolder: `确认或修改语言（自动识别：${detected}）` },
  );
  return picked?.label;
}

export async function pickProjectTagsForImport(
  projectManager: ProjectManager,
  initialTags: string[],
): Promise<string[] | undefined> {
  const allTags = projectManager.getTags();
  const selectedTagKeys = new Set(initialTags.map((t) => t.toLowerCase()));
  type TagPickItem = vscode.QuickPickItem & { value: string };
  const createValue = "__create__";
  const tagPickItems: TagPickItem[] = [
    { label: "新建标签…", value: createValue },
    ...allTags
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((tag) => ({
        label: tag,
        value: tag,
        picked: selectedTagKeys.has(tag.toLowerCase()),
      })),
  ];

  const tagSelection = await vscode.window.showQuickPick<TagPickItem>(tagPickItems, {
    canPickMany: true,
    placeHolder: "选择标签（可多选，可不选）",
    matchOnDescription: true,
  });

  if (tagSelection === undefined) {
    return undefined;
  }

  const chosen = tagSelection.filter((i) => i.value !== createValue).map((i) => i.value);

  if (tagSelection.some((i) => i.value === createValue)) {
    const input = await vscode.window.showInputBox({
      prompt: "新标签（逗号分隔）",
      placeHolder: "例如 backend, demo",
    });
    if (input === undefined) {
      return undefined;
    }
    const created = input
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
    await projectManager.upsertTags(created);
    return mergeTagLists(chosen, created);
  }

  return chosen;
}

export async function openPromarksProject(
  projectManager: ProjectManager,
  project: Project,
  newWindow: boolean,
): Promise<void> {
  if (project.isRemote && project.remoteHost) {
    const authority = `ssh-remote+${project.remoteHost}`;
    const uri = vscode.Uri.from({
      scheme: "vscode-remote",
      authority,
      path: project.path,
    });
    await projectManager.updateLastOpened(project.id);
    await vscode.commands.executeCommand("vscode.openFolder", uri, {
      forceNewWindow: newWindow,
    });
    return;
  }

  const uri = vscode.Uri.file(project.path);
  await projectManager.updateLastOpened(project.id);
  await vscode.commands.executeCommand("vscode.openFolder", uri, {
    forceNewWindow: newWindow,
  });
}

export async function addLocalFolderProject(
  projectManager: ProjectManager,
  onAfter?: () => void,
): Promise<string | undefined> {
  const result = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "添加项目",
  });

  if (result && result.length > 0) {
    const folderPath = result[0].fsPath;
    await projectManager.addProject(folderPath);
    onAfter?.();
    return folderPath;
  }
  return undefined;
}

export async function addRemoteProjectFlow(
  projectManager: ProjectManager,
  onAfter?: () => void,
): Promise<void> {
  const host = await vscode.window.showInputBox({
    prompt: "SSH 主机（例如 user@hostname）",
    placeHolder: "user@hostname",
  });
  if (!host) {
    return;
  }

  const remotePath = await vscode.window.showInputBox({
    prompt: "远程路径",
    placeHolder: "/home/user/project",
  });
  if (!remotePath) {
    return;
  }

  await projectManager.addRemoteProject(host, remotePath);
  onAfter?.();
}

export async function importCurrentWorkspaceFolder(
  projectManager: ProjectManager,
  onAfter?: () => void,
): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    await vscode.window.showInformationMessage("当前没有打开的工作区文件夹，无法导入。");
    return;
  }

  let target: vscode.WorkspaceFolder;
  if (folders.length === 1) {
    target = folders[0];
  } else {
    const picked = await vscode.window.showQuickPick(
      folders.map((f) => ({
        label: f.name,
        description: f.uri.scheme === "file" ? f.uri.fsPath : f.uri.path,
        folder: f,
      })),
      { placeHolder: "选择要导入的工作区文件夹" },
    );
    if (!picked) {
      return;
    }
    target = picked.folder;
  }

  const uri = target.uri;
  const ssh = parseSshRemoteFolder(uri);
  const isSshRemote = Boolean(ssh);

  if (uri.scheme === "vscode-remote" && !ssh) {
    await vscode.window.showWarningMessage(
      "当前远程工作区不是 SSH Remote，无法自动写入「远程」列表。请使用视图标题中的「添加远程项目」手动填写。",
    );
    return;
  }

  const nameInput = await vscode.window.showInputBox({
    prompt: isSshRemote ? "项目名称（将保存到「远程」列表）" : "项目名称（将保存到「本地」列表）",
    value: target.name,
    validateInput: (v) => (v.trim().length === 0 ? "名称不能为空" : null),
  });
  if (nameInput === undefined) {
    return;
  }

  const detected = await projectManager.detectLanguageFromUri(uri);
  const language = await pickLanguageWithDetected(detected);
  if (language === undefined) {
    return;
  }

  const tags = await pickProjectTagsForImport(projectManager, []);
  if (tags === undefined) {
    return;
  }

  if (isSshRemote && ssh) {
    await projectManager.addRemoteProjectWithMeta({
      host: ssh.host,
      remotePath: ssh.remotePath,
      name: nameInput.trim(),
      tags,
      language,
      remark: `SSH: ${ssh.host}`,
    });
    await vscode.window.showInformationMessage(`已加入远程项目：${nameInput.trim()}`);
  } else {
    await projectManager.addLocalProjectWithMeta({
      folderPath: uri.fsPath,
      name: nameInput.trim(),
      tags,
      language,
      remark: "",
    });
    await vscode.window.showInformationMessage(`已加入本地项目：${nameInput.trim()}`);
  }

  onAfter?.();
}

export async function editPromarksProject(
  projectManager: ProjectManager,
  id: string,
  onAfter?: () => void,
): Promise<void> {
  const project = projectManager.getProject(id);
  if (!project) {
    return;
  }

  const remark = await vscode.window.showInputBox({
    prompt: "项目备注",
    value: project.remark ?? "",
  });

  if (remark === undefined) {
    return;
  }

  const languagePicks = LANGUAGE_OPTIONS.map((value) => ({
    label: value,
    value,
  }));

  const selectedLanguage = await vscode.window.showQuickPick(languagePicks, {
    placeHolder: "选择语言",
    canPickMany: false,
  });

  const allTags = projectManager.getTags();
  const projectTags = Array.isArray(project.tags) ? project.tags : [];
  const selectedTagKeys = new Set(projectTags.map((t) => t.toLowerCase()));
  type TagPickItem = vscode.QuickPickItem & { value: string };
  const createValue = "__create__";
  const tagPickItems: TagPickItem[] = [
    { label: "新建标签…", value: createValue },
    ...allTags
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((tag) => ({
        label: tag,
        value: tag,
        picked: selectedTagKeys.has(tag.toLowerCase()),
      })),
  ];

  const tagSelection = await vscode.window.showQuickPick<TagPickItem>(tagPickItems, {
    canPickMany: true,
    placeHolder: "选择标签（可多选）",
    matchOnDescription: true,
  });

  let nextTags = projectTags;
  if (tagSelection) {
    const chosen = tagSelection
      .filter((i) => i.value !== createValue)
      .map((i) => i.value);

    if (tagSelection.some((i) => i.value === createValue)) {
      const input = await vscode.window.showInputBox({
        prompt: "新标签（逗号分隔）",
        placeHolder: "例如 backend, demo",
      });
      if (input !== undefined) {
        const created = input
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t.length > 0);
        await projectManager.upsertTags(created);
        nextTags = mergeTagLists(chosen, created);
      } else {
        nextTags = chosen;
      }
    } else {
      nextTags = chosen;
    }
  }

  await projectManager.updateProject(id, {
    remark,
    language: selectedLanguage?.value ?? project.language,
    tags: nextTags,
  });

  onAfter?.();
}

export async function deletePromarksProject(
  projectManager: ProjectManager,
  id: string,
  onAfter?: () => void,
): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    "确定从列表中移除此项目？",
    "确定",
    "取消",
  );
  if (choice === "确定") {
    await projectManager.removeProject(id);
    onAfter?.();
  }
}

function mergeTagLists(base: string[], extra: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  const push = (tag: string) => {
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
  for (const t of base) {
    push(t);
  }
  for (const t of extra) {
    push(t);
  }
  return result;
}
