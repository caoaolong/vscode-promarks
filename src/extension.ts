import * as vscode from "vscode";
import { ProjectManager } from "./manager/project_manager";
import { WelcomeView } from "./view/welcome_view";
import { registerProjectSidebar } from "./view/project_sidebar_tree";

export function activate(context: vscode.ExtensionContext) {
  console.log("vscode-promarks is active");

  const projectManager = new ProjectManager(context);
  const welcomeView = new WelcomeView(context, projectManager);

  registerProjectSidebar(context, projectManager, () => welcomeView.refresh());

  const openCommand = vscode.commands.registerCommand(
    "vscode-promarks.showWelcomePage",
    () => {
      welcomeView.show();
    },
  );
  context.subscriptions.push(openCommand);

  // If no workspace is open, show the welcome page
  if (
    !vscode.workspace.workspaceFolders ||
    vscode.workspace.workspaceFolders.length === 0
  ) {
    welcomeView.show();
  }
}

export function deactivate() {}
