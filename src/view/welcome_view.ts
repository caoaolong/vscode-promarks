import * as vscode from 'vscode';
import { ProjectManager, Project } from '../manager/project_manager';
import {
    addLocalFolderProject,
    addRemoteProjectFlow,
    deletePromarksProject,
    editPromarksProject,
    openPromarksProject
} from '../project_actions';

export class WelcomeView {
    public static readonly viewType = 'vscode-promarks.welcomeView';
    private panel: vscode.WebviewPanel | undefined;
    private static readonly OPEN_AFTER_ADD_KEY = 'vscode-promarks.openAfterAdd';
    private static readonly SORT_MODE_KEY = 'vscode-promarks.sortMode';
    private static readonly TAG_FILTER_KEY = 'vscode-promarks.tagFilter';

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
                        await this.openProject(message.path, message.isRemote);
                        break;
                    case 'addProject':
                        await this.addProject();
                        break;
                    case 'addRemoteProject':
                        await this.addRemoteProject();
                        break;
                    case 'selectTagFilter':
                        await this.selectTagFilter();
                        break;
                    case 'editTags':
                        await this.editTags(message.id);
                        break;
                    case 'setOpenAfterAdd':
                        await this.setOpenAfterAdd(Boolean(message.value));
                        break;
                    case 'setSortMode':
                        await this.setSortMode(message.value);
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

    public refresh(): void {
        void this.updateContent();
    }

    private async openProject(projectPath: string, isRemote?: boolean) {
        const projects = this.projectManager.getProjects();
        const project = isRemote
            ? projects.find((p) => p.path === projectPath && p.isRemote)
            : projects.find((p) => p.path === projectPath && !p.isRemote) ??
              projects.find((p) => p.id === projectPath);
        if (!project) {
            return;
        }
        const newWindow = Boolean(isRemote);
        await openPromarksProject(this.projectManager, project, newWindow);
        await this.updateContent();
    }

    private async addProject() {
        const folderPath = await addLocalFolderProject(this.projectManager, () =>
            void this.updateContent()
        );
        if (folderPath && this.getOpenAfterAdd()) {
            await this.openProject(folderPath, false);
        }
    }

    private async addRemoteProject() {
        await addRemoteProjectFlow(this.projectManager, () => void this.updateContent());
    }

    private getOpenAfterAdd(): boolean {
        return this.context.globalState.get<boolean>(WelcomeView.OPEN_AFTER_ADD_KEY, true);
    }

    private async setOpenAfterAdd(value: boolean) {
        await this.context.globalState.update(WelcomeView.OPEN_AFTER_ADD_KEY, value);
    }

    private getSortMode(): string {
        return this.context.globalState.get<string>(WelcomeView.SORT_MODE_KEY, 'none');
    }

    private async setSortMode(value: string) {
        await this.context.globalState.update(WelcomeView.SORT_MODE_KEY, value);
        await this.updateContent();
    }

    private getTagFilter(): string[] {
        return this.context.globalState.get<string[]>(WelcomeView.TAG_FILTER_KEY, []);
    }

    private async setTagFilter(tags: string[]) {
        await this.context.globalState.update(WelcomeView.TAG_FILTER_KEY, tags);
        await this.updateContent();
    }

    private async selectTagFilter() {
        const allTags = this.projectManager.getTags();
        if (allTags.length === 0) {
            await vscode.window.showInformationMessage('No tags available.');
            return;
        }

        const current = new Set(this.getTagFilter().map((t) => t.toLowerCase()));
        type TagFilterPickItem = vscode.QuickPickItem & { value: string };
        const clearValue = '__clear__';
        const items: TagFilterPickItem[] = [
            { label: 'Clear tag filter', value: clearValue },
            ...allTags
                .slice()
                .sort((a, b) => a.localeCompare(b))
                .map((tag) => ({
                    label: tag,
                    value: tag,
                    picked: current.has(tag.toLowerCase()),
                })),
        ];

        const selected = await vscode.window.showQuickPick<TagFilterPickItem>(items, {
            canPickMany: true,
            placeHolder: 'Filter by tags',
            matchOnDescription: true,
        });

        if (!selected) {
            return;
        }

        if (selected.some((i) => i.value === clearValue)) {
            await this.setTagFilter([]);
            return;
        }

        await this.setTagFilter(selected.map((i) => i.value));
    }

    private async editProject(id: string) {
        await editPromarksProject(this.projectManager, id, () => void this.updateContent());
    }

    private async editTags(id: string) {
        const project = this.projectManager.getProject(id);
        if (!project) {
            return;
        }
        const allTags = this.projectManager.getTags();
        const projectTags = Array.isArray(project.tags) ? project.tags : [];
        const selectedTagKeys = new Set(projectTags.map((t) => t.toLowerCase()));
        type TagPickItem = vscode.QuickPickItem & { value: string };
        const createValue = '__create__';
        const tagPickItems: TagPickItem[] = [
            { label: 'Create new tag…', value: createValue },
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
            placeHolder: 'Select tags (multiple)',
            matchOnDescription: true,
        });

        let nextTags = projectTags;
        if (tagSelection) {
            const chosen = tagSelection
                .filter((i) => i.value !== createValue)
                .map((i) => i.value);

            if (tagSelection.some((i) => i.value === createValue)) {
                const input = await vscode.window.showInputBox({
                    prompt: 'New tags (comma separated)',
                    placeHolder: 'e.g. backend, demo, urgent',
                });
                if (input !== undefined) {
                    const created = input
                        .split(',')
                        .map((t) => t.trim())
                        .filter((t) => t.length > 0);
                    await this.projectManager.upsertTags(created);
                    nextTags = this.mergeTags(chosen, created);
                } else {
                    nextTags = chosen;
                }
            } else {
                nextTags = chosen;
            }
        }

        await this.projectManager.updateProject(id, { tags: nextTags });
        await this.updateContent();
    }

    private async deleteProject(id: string) {
        await deletePromarksProject(this.projectManager, id, () => void this.updateContent());
    }

    private getHtmlForWebview(projects: Project[]): string {
        const codiconsUri = this.panel?.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'codicon.css'));
        const openAfterAdd = this.getOpenAfterAdd();
        const sortMode = this.getSortMode();
        const tagFilter = this.getTagFilter();
        const tagFilterLower = new Set(tagFilter.map((t) => t.toLowerCase()));

        const filteredProjects = tagFilter.length === 0
            ? projects
            : projects.filter((p) => {
                const tags = Array.isArray(p.tags) ? p.tags : [];
                return tags.some((t) => tagFilterLower.has(t.toLowerCase()));
            });
        
        let content = '';

        if (sortMode === 'none') {
            content = `<div class="grid-container">
                ${this.renderProjects(filteredProjects)}
                ${this.renderAddCards()}
            </div>`;
        } else {
            const groups = this.groupProjects(filteredProjects, sortMode);
            content = `<div class="groups-container">
                ${groups.map(g => `
                    <div class="group-header">${g.title}</div>
                    <div class="grid-container">
                        ${this.renderProjects(g.projects)}
                    </div>
                `).join('')}
                <div class="group-header">Actions</div>
                <div class="grid-container">
                    ${this.renderAddCards()}
                </div>
            </div>`;
        }

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${codiconsUri}" rel="stylesheet" />
            <style>
                :root {
                    --container-paddding: 20px;
                }
                body {
                    font-family: var(--vscode-font-family);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    padding: 0;
                    margin: 0;
                    color-scheme: light dark;
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
                .top-bar-right {
                    display: inline-flex;
                    gap: 8px;
                    align-items: center;
                }
                .sort-control select {
                    background: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    border: 1px solid var(--vscode-dropdown-border);
                    padding: 4px;
                    border-radius: 4px;
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
                .active-filters {
                    padding: 8px 20px 0 20px;
                    color: var(--vscode-descriptionForeground);
                    font-size: 0.85em;
                    display: ${tagFilter.length > 0 ? 'block' : 'none'};
                }
                .grid-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 16px;
                    padding: 16px;
                }
                .group-header {
                    padding: 10px 16px 0 16px;
                    font-size: 1.2em;
                    font-weight: bold;
                    color: var(--vscode-textLink-foreground);
                }
                .footer {
                    display: flex;
                    justify-content: flex-end;
                    padding: 0 16px 12px 16px;
                    margin-top: auto;
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
                    padding: 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    min-height: 160px;
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
                .card-footer {
                    display: flex;
                    justify-content: flex-end;
                    margin-top: 8px;
                    gap: 8px;
                }
                .project-name {
                    font-weight: bold;
                    font-size: 1em;
                    margin-bottom: 5px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .project-language {
                    font-size: 0.85em;
                    color: var(--vscode-descriptionForeground);
                    text-transform: capitalize;
                }
                .project-remark {
                    font-size: 0.85em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 6px;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .project-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-top: 6px;
                    overflow: hidden;
                }
                .tag-chip {
                    font-size: 0.75em;
                    padding: 2px 8px;
                    border-radius: 999px;
                    border: 1px solid transparent;
                    background-color: hsl(var(--tag-hue, 210) var(--tag-saturation, 55%) var(--tag-bg-lightness, 30%));
                    color: hsl(var(--tag-hue, 210) var(--tag-text-saturation, 70%) var(--tag-text-lightness, 86%));
                    border-color: hsl(var(--tag-hue, 210) var(--tag-saturation, 55%) var(--tag-border-lightness, 40%));
                    max-width: 100%;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .tag-chip--more {
                    background-color: var(--vscode-badge-background);
                    border-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                }
                @media (prefers-color-scheme: light) {
                    .tag-chip {
                        background-color: hsl(var(--tag-hue, 210) var(--tag-saturation, 55%) var(--tag-bg-lightness, 88%));
                        color: hsl(var(--tag-hue, 210) var(--tag-text-saturation, 55%) var(--tag-text-lightness, 25%));
                        border-color: hsl(var(--tag-hue, 210) var(--tag-saturation, 55%) var(--tag-border-lightness, 72%));
                    }
                }
                .last-opened {
                    font-size: 0.75em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: auto;
                    padding-top: 8px;
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
                    font-size: 36px;
                    color: var(--vscode-textLink-foreground);
                }
                .add-text {
                    margin-top: 8px;
                    font-weight: bold;
                }
                .chip-button {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.75em;
                    padding: 2px 8px;
                    border-radius: 999px;
                    border: 1px solid var(--vscode-widget-border, #454545);
                    color: var(--vscode-foreground);
                    background: transparent;
                    cursor: pointer;
                }
                .chip-button:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="top-bar">
                <h1>Project Manager</h1>
                <div class="top-bar-right">
                    <button class="icon-button" onclick="selectTagFilter()" title="Filter by tags">
                        <i class="codicon codicon-filter"></i>
                    </button>
                    <div class="sort-control">
                        <select id="sortMode" onchange="setSortMode()">
                            <option value="none" ${sortMode === 'none' ? 'selected' : ''}>Sort by: Default</option>
                            <option value="language" ${sortMode === 'language' ? 'selected' : ''}>Sort by: Language</option>
                            <option value="time" ${sortMode === 'time' ? 'selected' : ''}>Sort by: Time</option>
                            <option value="location" ${sortMode === 'location' ? 'selected' : ''}>Sort by: Location</option>
                            <option value="tag" ${sortMode === 'tag' ? 'selected' : ''}>Sort by: Tag</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="active-filters">
                Tag filter: ${tagFilter.map((t) => this.escapeHtml(t)).join(', ')}
            </div>
            ${content}
            <div class="footer">
                <label class="checkbox-row" title="控制新建项目后是否立即打开该项目">
                    <input id="openAfterAdd" type="checkbox" ${openAfterAdd ? 'checked' : ''} onchange="setOpenAfterAdd()" />
                    新建后立即打开项目
                </label>
            </div>
            <script>
                const vscode = acquireVsCodeApi();
                
                function openProject(path, isRemote) {
                    vscode.postMessage({
                        command: 'openProject',
                        path: path,
                        isRemote: isRemote === 'true'
                    });
                }

                function addProject() {
                    vscode.postMessage({
                        command: 'addProject'
                    });
                }
                
                function addRemoteProject() {
                    vscode.postMessage({
                        command: 'addRemoteProject'
                    });
                }

                function setOpenAfterAdd() {
                    const el = document.getElementById('openAfterAdd');
                    vscode.postMessage({
                        command: 'setOpenAfterAdd',
                        value: Boolean(el && el.checked)
                    });
                }

                function setSortMode() {
                    const el = document.getElementById('sortMode');
                    vscode.postMessage({
                        command: 'setSortMode',
                        value: el.value
                    });
                }

                function selectTagFilter() {
                    vscode.postMessage({
                        command: 'selectTagFilter'
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

                function editTags(event, id) {
                    event.stopPropagation();
                    vscode.postMessage({
                        command: 'editTags',
                        id: id
                    });
                }
            </script>
        </body>
        </html>`;
    }

    private renderProjects(projects: Project[]): string {
        return projects.map(p => {
            const iconClass = this.getIconForLanguage(p.language);
            // Escape path for JS string
            const escapedPath = p.path.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const nameText = this.escapeHtml(p.name);
            const pathText = this.escapeHtml(p.path);
            const languageText = this.escapeHtml(p.language);
            const remarkText = this.escapeHtml(p.remark ?? '');
            const hasRemark = remarkText.length > 0;
            const escapedId = p.id.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const isRemote = p.isRemote === true;
            const tags = Array.isArray(p.tags) ? p.tags : [];
            const maxTags = 3;
            const visibleTags = tags.slice(0, maxTags);
            const extraCount = tags.length - visibleTags.length;
            const tagsHtml = [
                ...visibleTags.map((t) => {
                    const hue = this.getTagHue(t);
                    return `<span class="tag-chip" style="--tag-hue:${hue}">${this.escapeHtml(t)}</span>`;
                }),
                ...(extraCount > 0 ? [`<span class="tag-chip tag-chip--more">+${extraCount}</span>`] : [])
            ].join('');
            
            return `
            <div class="card" onclick="openProject('${escapedPath}', '${isRemote}')">
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
                    <div class="project-language">${languageText} ${isRemote ? '(SSH)' : ''}</div>
                    ${hasRemark ? `<div class="project-remark" title="${remarkText}">${remarkText}</div>` : ''}
                    ${tags.length > 0 ? `<div class="project-tags">${tagsHtml}</div>` : ''}
                    <div class="last-opened">Last opened: ${new Date(p.lastOpened).toLocaleDateString()} ${new Date(p.lastOpened).toLocaleTimeString()}</div>
                    <div class="card-footer">
                        <button class="chip-button" onclick="editTags(event, '${escapedId}')" title="Edit tags">
                            <i class="codicon codicon-tag"></i> Tags
                        </button>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }

    private renderAddCards(): string {
        return `
            <div class="card add-card" onclick="addProject()">
                <div class="add-icon">
                    <i class="codicon codicon-add"></i>
                </div>
                <div class="add-text">Local Project</div>
            </div>
            <div class="card add-card" onclick="addRemoteProject()">
                <div class="add-icon">
                    <i class="codicon codicon-remote"></i>
                </div>
                <div class="add-text">SSH Project</div>
            </div>
        `;
    }

    private groupProjects(projects: Project[], mode: string): { title: string, projects: Project[] }[] {
        if (mode === 'language') {
            const groups: { [key: string]: Project[] } = {};
            projects.forEach(p => {
                const key = p.language || 'other';
                if (!groups[key]) {
                    groups[key] = [];
                }
                groups[key].push(p);
            });
            return Object.keys(groups).sort().map(key => ({
                title: key.toUpperCase(),
                projects: groups[key]
            }));
        } else if (mode === 'time') {
            const now = Date.now();
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            const recent = projects.filter(p => now - p.lastOpened < oneWeek);
            const earlier = projects.filter(p => now - p.lastOpened >= oneWeek);
            const result = [];
            if (recent.length > 0) {
                result.push({ title: 'Recent Week', projects: recent });
            }
            if (earlier.length > 0) {
                result.push({ title: 'Earlier', projects: earlier });
            }
            return result;
        } else if (mode === 'location') {
            const local = projects.filter(p => !p.isRemote);
            const remote = projects.filter(p => p.isRemote);
            const result = [];
            if (local.length > 0) {
                result.push({ title: 'Local', projects: local });
            }
            if (remote.length > 0) {
                result.push({ title: 'Remote (SSH)', projects: remote });
            }
            return result;
        } else if (mode === 'tag') {
            const groups: { [key: string]: Project[] } = {};
            const untaggedKey = 'Untagged';
            for (const p of projects) {
                const tags = Array.isArray(p.tags) ? p.tags : [];
                if (tags.length === 0) {
                    if (!groups[untaggedKey]) {
                        groups[untaggedKey] = [];
                    }
                    groups[untaggedKey].push(p);
                    continue;
                }
                for (const tag of tags) {
                    const key = tag.trim();
                    if (key.length === 0) {
                        continue;
                    }
                    if (!groups[key]) {
                        groups[key] = [];
                    }
                    groups[key].push(p);
                }
            }
            const keys = Object.keys(groups).sort((a, b) => {
                if (a === untaggedKey) {
                    return 1;
                }
                if (b === untaggedKey) {
                    return -1;
                }
                return a.localeCompare(b);
            });
            return keys.map((k) => ({ title: k, projects: groups[k] }));
        }
        return [{ title: 'All Projects', projects }];
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

    private getTagHue(tag: string): number {
        const normalized = tag.trim().toLowerCase();
        let hash = 5381;
        for (let i = 0; i < normalized.length; i += 1) {
            hash = ((hash << 5) + hash) + normalized.charCodeAt(i);
        }
        const hue = Math.abs(hash) % 360;
        return hue;
    }

    private mergeTags(base: string[], extra: string[]): string[] {
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
}
