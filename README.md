# vscode-promarks

![](https://raw.githubusercontent.com/caoaolong/vscode-promarks/refs/heads/master/example1.png)

![](https://raw.githubusercontent.com/caoaolong/vscode-promarks/refs/heads/master/example2.png)

---

项目收藏夹插件：在未打开任何工作区时提供一个项目管理页，集中展示你常用的项目，支持一键打开、管理备注与语言类型。

## Features

- **空工作区自动展示项目页**：打开一个新的 VS Code 窗口且没有打开任何工作区时，自动显示 Project Manager 页面
- **网格卡片布局**：每个项目以卡片展示名称、语言与图标、上次打开时间
- **一键打开项目**：点击卡片可直接打开该项目目录
- **项目管理**：支持删除项目卡片、编辑备注与语言类型
- **新建项目卡片**：点击 “New Project” 选择目录并加入列表
- **可选自动打开**：页面底部复选框控制“新建后立即打开项目”

## Usage

**自动打开**

- 在没有打开任何工作区的情况下打开 VS Code，新窗口会自动显示 Project Manager 页面

**手动打开**

- 打开命令面板（Ctrl+Shift+P），执行：`Show Project Manager`

**添加项目**

- 点击网格中的 “New Project” 卡片，选择一个目录
- 选择后会保存为项目卡片；是否立即打开由底部复选框控制

**编辑/删除项目**

- 点击卡片右上角齿轮：编辑项目备注、语言类型
- 点击卡片右上角关闭：从列表移除该项目

## Requirements

- VS Code >= 1.105.1

## Extension Settings

当前版本未提供 VS Code Settings（`contributes.configuration`）。

- “新建后立即打开项目”开关保存在插件的全局存储中（globalState），通过页面底部复选框进行控制。

## Data Storage

- 项目列表存储在 VS Code 的 `globalState` 中（与工作区无关，跨窗口持久化）。

## Known Issues

- Webview 页面暂不支持在同一个窗口同时打开多个 Project Manager 标签页（会复用同一面板）。

## Release Notes

详见 [changelog.md](./changelog.md)。
