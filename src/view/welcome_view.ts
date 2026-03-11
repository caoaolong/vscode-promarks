import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectManager, Project } from '../manager/project_manager';

export class WelcomeView {
    public static readonly viewType = 'vscode-promarks.welcomeView';
    private panel: vscode.WebviewPanel | undefined;
    private static readonly OPEN_AFTER_ADD_KEY = 'vscode-promarks.openAfterAdd';

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly projectManager: ProjectManager
    ) {}

    public show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            WelcomeView.viewType,
            'Project Manager',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media')
                ]
            }
        );

        this.panel.iconPath = {
            light: vscode.Uri.joinPath(this.context.extensionUri, 'logo.png'),
            dark: vscode.Uri.joinPath(this.context.extensionUri, 'logo.png')
        };

        this.panel.onDidDispose(() => {
            this.panel = undefined;
        }, null, this.context.subscriptions);

        this.panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'openProject':
                        await this.openProject(message.path);
                        break;
                    case 'addProject':
                        await this.addProject();
                        break;
                    case 'setOpenAfterAdd':
                        await this.setOpenAfterAdd(Boolean(message.value));
                        break;
                    case 'editProject':
                        await this.editProject(message.id);
                        break;
                    case 'deleteProject':
                        await this.deleteProject(message.id);
                        break;
                }
            },
            null,
            this.context.subscriptions
        );

        this.updateContent();
    }

    private async updateContent() {
        if (!this.panel) {
            return;
        }
        const projects = this.projectManager.getProjects();
        this.panel.webview.html = this.getHtmlForWebview(projects);
    }

    private async openProject(projectPath: string) {
        const uri = vscode.Uri.file(projectPath);
        // Update last opened time
        await this.projectManager.updateLastOpened(projectPath);
        // Force new window false to replace current if desired, but user might want new window.
        // Usually, if no workspace is open, it reuses the window.
        await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: false });
    }

    private async addProject() {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Add Project'
        });

        if (result && result.length > 0) {
            const folderPath = result[0].fsPath;
            await this.projectManager.addProject(folderPath);
            await this.updateContent();
            if (this.getOpenAfterAdd()) {
                await this.openProject(folderPath);
            }
        }
    }

    private getOpenAfterAdd(): boolean {
        return this.context.globalState.get<boolean>(WelcomeView.OPEN_AFTER_ADD_KEY, true);
    }

    private async setOpenAfterAdd(value: boolean) {
        await this.context.globalState.update(WelcomeView.OPEN_AFTER_ADD_KEY, value);
    }

    private async editProject(id: string) {
        const project = this.projectManager.getProject(id);
        if (!project) {
            return;
        }

        const remark = await vscode.window.showInputBox({
            prompt: 'Project remark',
            value: project.remark ?? '',
        });

        if (remark === undefined) {
            return;
        }

        const languages = [
            'python',
            'java',
            'go',
            'javascript',
            'typescript',
            'rust',
            'cpp',
            'csharp',
            'other',
        ];

        const languagePicks = languages.map((value) => ({
            label: value,
            value,
        }));

        const selectedLanguage = await vscode.window.showQuickPick(languagePicks, {
            placeHolder: 'Select language',
            canPickMany: false,
        });

        await this.projectManager.updateProject(id, {
            remark,
            language: selectedLanguage?.value ?? project.language,
        });

        await this.updateContent();
    }

    private async deleteProject(id: string) {
        const choice = await vscode.window.showWarningMessage(
            'Are you sure you want to remove this project from the list?',
            'Yes',
            'No'
        );
        if (choice === 'Yes') {
            await this.projectManager.removeProject(id);
            await this.updateContent();
        }
    }

    private getHtmlForWebview(projects: Project[]): string {
        const codiconsUri = this.panel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'codicon.css'));
        const openAfterAdd = this.getOpenAfterAdd();
        
        // Generate cards HTML
        const projectCards = projects.map(p => {
            const iconClass = this.getIconForLanguage(p.language);
            // Escape path for JS string
            const escapedPath = p.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const nameText = this.escapeHtml(p.name);
            const pathText = this.escapeHtml(p.path);
            const languageText = this.escapeHtml(p.language);
            const remarkText = this.escapeHtml(p.remark ?? '');
            const hasRemark = remarkText.length > 0;
            const escapedId = p.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            return `
            <div class="card" onclick="openProject('${escapedPath}')">
                <div class="card-header">
                    <div class="project-icon">
                        <i class="codicon ${iconClass}"></i>
                    </div>
                    <div class="card-actions">
                        <div class="card-action" onclick="editProject(event, '${escapedId}')" title="Edit">
                            <i class="codicon codicon-gear"></i>
                        </div>
                        <div class="card-action" onclick="deleteProject(event, '${escapedId}')" title="Remove from list">
                            <i class="codicon codicon-close"></i>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div class="project-name" title="${pathText}">${nameText}</div>
                    <div class="project-language">${languageText}</div>
                    ${hasRemark ? `<div class="project-remark" title="${remarkText}">${remarkText}</div>` : ''}
                    <div class="last-opened">Last opened: ${new Date(p.lastOpened).toLocaleDateString()} ${new Date(p.lastOpened).toLocaleTimeString()}</div>
                </div>
            </div>
            `;
        }).join('');

        const addCard = `
            <div class="card add-card" onclick="addProject()">
                <div class="add-icon">
                    <i class="codicon codicon-add"></i>
                </div>
                <div class="add-text">New Project</div>
            </div>
        `;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${codiconsUri}" rel="stylesheet" />
            <style>
                :root {
                    --container-paddding: 20px;
                    --input-padding-vertical: 6px;
                    --input-padding-horizontal: 4px;
                    --input-margin-vertical: 4px;
                    --input-margin-horizontal: 0;
                }
                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 0;
                    margin: 0;
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                }
                h1 {
                    padding: 0;
                    font-weight: normal;
                    margin: 0;
                    font-size: 22px;
                }
                .top-bar {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 20px 20px 0 20px;
                    gap: 12px;
                }
                .top-bar-actions {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                .icon-button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    border: 1px solid var(--vscode-widget-border, #454545);
                    background: transparent;
                    color: var(--vscode-foreground);
                    cursor: pointer;
                }
                .icon-button:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }
                .grid-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 20px;
                    padding: 20px;
                    flex: 1;
                }
                .footer {
                    display: flex;
                    justify-content: flex-end;
                    padding: 0 20px 16px 20px;
                }
                .checkbox-row {
                    display: inline-flex;
                    gap: 10px;
                    align-items: center;
                    font-size: 0.9em;
                    color: var(--vscode-foreground);
                    user-select: none;
                }
                .checkbox-row input[type="checkbox"] {
                    width: 16px;
                    height: 16px;
                }
                .card {
                    background-color: var(--vscode-editor-widget-background, #252526); /* Fallback */
                    border: 1px solid var(--vscode-widget-border, #454545);
                    border-radius: 6px;
                    padding: 15px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    height: 140px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .card:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                    border-color: var(--vscode-focusBorder);
                }
                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 10px;
                }
                .project-icon i {
                    font-size: 32px;
                    color: var(--vscode-textLink-foreground);
                }
                .card-actions {
                    display: flex;
                    gap: 4px;
                }
                .card-action {
                    opacity: 0;
                    transition: opacity 0.2s;
                    padding: 4px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .card-action:hover {
                    background-color: var(--vscode-toolbar-hoverBackground);
                }
                .card:hover .card-action {
                    opacity: 1;
                }
                .card-body {
                    display: flex;
                    flex-direction: column;
                    flex-grow: 1;
                }
                .project-name {
                    font-weight: bold;
                    font-size: 1.1em;
                    margin-bottom: 5px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .project-language {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    text-transform: capitalize;
                }
                .project-remark {
                    font-size: 0.85em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 6px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .last-opened {
                    font-size: 0.75em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: auto;
                    padding-top: 10px;
                    border-top: 1px solid var(--vscode-widget-shadow);
                }
                .add-card {
                    border-style: dashed;
                    align-items: center;
                    justify-content: center;
                    background-color: transparent;
                }
                .add-card:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .add-icon i {
                    font-size: 40px;
                    color: var(--vscode-textLink-foreground);
                }
                .add-text {
                    margin-top: 10px;
                    font-weight: bold;
                }
            </style>
        </head>
        <body>
            <div class="top-bar">
                <h1>Project Manager</h1>
            </div>
            <div class="grid-container">
                ${projectCards}
                ${addCard}
            </div>
            <div class="footer">
                <label class="checkbox-row" title="控制新建项目后是否立即打开该项目">
                    <input id="openAfterAdd" type="checkbox" ${openAfterAdd ? 'checked' : ''} onchange="setOpenAfterAdd()" />
                    新建后立即打开项目
                </label>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                
                function openProject(path) {
                    vscode.postMessage({
                        command: 'openProject',
                        path: path
                    });
                }

                function addProject() {
                    vscode.postMessage({
                        command: 'addProject'
                    });
                }

                function setOpenAfterAdd() {
                    const el = document.getElementById('openAfterAdd');
                    vscode.postMessage({
                        command: 'setOpenAfterAdd',
                        value: Boolean(el && el.checked)
                    });
                }

                function editProject(event, id) {
                    event.stopPropagation();
                    vscode.postMessage({
                        command: 'editProject',
                        id: id
                    });
                }

                function deleteProject(event, id) {
                    event.stopPropagation();
                    vscode.postMessage({
                        command: 'deleteProject',
                        id: id
                    });
                }
            </script>
        </body>
        </html>`;
    }

    private getIconForLanguage(language: string): string {
        switch (language.toLowerCase()) {
            case 'python': return 'codicon-python';
            case 'java': return 'codicon-symbol-class';
            case 'javascript': return 'codicon-file-code';
            case 'typescript': return 'codicon-file-code';
            case 'go': return 'codicon-go-to-file';
            case 'rust': return 'codicon-gear';
            case 'cpp': return 'codicon-file-binary';
            default: return 'codicon-file-directory';
        }
    }

    private escapeHtml(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
