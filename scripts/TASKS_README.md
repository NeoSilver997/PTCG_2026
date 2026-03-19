# Copilot Agent Tasks - Setup Guide

This workspace includes pre-configured tasks for analyzing code files using the Copilot Agent script.

## Available Tasks

1. **Copilot Agent: Analyze Current File** - Comprehensive file analysis
2. **Copilot Agent: Code Review** - Code quality review
3. **Copilot Agent: Architecture Analysis** - Architecture patterns analysis
4. **Copilot Agent: Bug Hunt** - Potential bug detection
5. **Copilot Agent: Migration Analysis** - Migration impact analysis

## How to Access Tasks

### Method 1: Command Palette (Quickest)
1. Press `Ctrl+Shift+P` (or `F1`)
2. Type: `Tasks: Run Task`
3. Select the desired "Copilot Agent" task from the list
4. The task will run on your currently open file

### Method 2: Terminal Menu
1. Click `Terminal` → `Run Task...`
2. Choose from the available tasks

### Method 3: Keyboard Shortcut
1. Press `Ctrl+Shift+B` to run the default build task
2. Select from the task list

## How to Configure/Add Tasks

### Using Command Palette:
1. Press `Ctrl+Shift+P`
2. Type: `Tasks: Configure Task`
3. Select the task you want to customize
4. VS Code will create/open `.vscode/tasks.json` or show workspace tasks

### Adding Tasks to Workspace File:

Tasks are defined in `PTCG_2026.code-workspace` under the `"tasks"` section:

```json
{
  "tasks": {
    "version": "2.0.0",
    "tasks": [
      {
        "label": "Your Task Name",
        "type": "shell",
        "command": "node",
        "args": [
          "${workspaceFolder:PTCG_2026}/scripts/your-script.js",
          "${file}"
        ],
        "group": "build",
        "presentation": {
          "echo": true,
          "reveal": "always",
          "focus": false,
          "panel": "shared"
        },
        "problemMatcher": []
      }
    ]
  }
}
```

### Using .vscode/tasks.json (Alternative):

For project-specific tasks, you can create `.vscode/tasks.json`:

1. Press `Ctrl+Shift+P`
2. Type: `Tasks: Configure Default Build Task`
3. Select `Create tasks.json from template`
4. Choose `Others` to create a custom task

Example `.vscode/tasks.json`:
```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "Custom Analysis",
      "type": "shell",
      "command": "node",
      "args": [
        "scripts/copilot-agent.js",
        "${file}",
        "comprehensive"
      ]
    }
  ]
}
```

## Task Variables

Common VS Code task variables used:

- `${workspaceFolder}` - Root folder path
- `${workspaceFolder:PTCG_2026}` - Specific workspace folder by name
- `${file}` - Currently open file path
- `${fileBasename}` - Current file name
- `${fileDirname}` - Current file's directory

## Troubleshooting

### Tasks Not Appearing?

1. **Reload VS Code Window:**
   - Press `Ctrl+Shift+P`
   - Type: `Developer: Reload Window`

2. **Verify Workspace is Open:**
   - Check bottom-left corner - should show "PTCG_2026 (WORKSPACE)"
   - If not, open: `File` → `Open Workspace from File...` → Select `PTCG_2026.code-workspace`

3. **Check Task Configuration:**
   - Press `Ctrl+Shift+P`
   - Type: `Tasks: Configure Task`
   - Verify your tasks are listed

4. **Verify Script Exists:**
   - Ensure `scripts/copilot-agent.js` exists in PTCG_2026 folder

### Task Execution Errors?

1. **Check Node.js is installed:**
   ```powershell
   node --version
   ```

2. **Verify file path in task arguments:**
   - Open file you want to analyze
   - Run task
   - Check terminal output for path errors

3. **Check working directory:**
   - Tasks use workspace folder as cwd by default
   - Verify relative paths in your script

## Task Configuration Options

### Presentation Options:
- `echo: true` - Show command being executed
- `reveal: always` - Always show terminal panel
- `focus: false` - Don't steal focus from editor
- `panel: shared` - Reuse same terminal panel

### Group Options:
- `"group": "build"` - Available via Ctrl+Shift+B
- `"group": "test"` - Available via test commands
- `"group": { "kind": "build", "isDefault": true }` - Default build task

### Problem Matchers:
- `"problemMatcher": []` - No problem matching
- `"problemMatcher": "$tsc"` - TypeScript errors
- `"problemMatcher": "$eslint-stylish"` - ESLint errors

## Examples

### Run Task on Current File:
```json
{
  "label": "Lint Current File",
  "type": "shell",
  "command": "eslint",
  "args": ["${file}"]
}
```

### Run Task with User Input:
```json
{
  "label": "Custom Input Task",
  "type": "shell",
  "command": "node",
  "args": [
    "scripts/processor.js",
    "${input:analysisType}"
  ],
  "inputs": [
    {
      "id": "analysisType",
      "type": "pickString",
      "description": "Analysis type",
      "options": ["quick", "deep", "full"]
    }
  ]
}
```

### Sequential Tasks:
```json
{
  "label": "Build and Test",
  "dependsOrder": "sequence",
  "dependsOn": ["build", "test"]
}
```

## Resources

- [VS Code Tasks Documentation](https://code.visualstudio.com/docs/editor/tasks)
- [Task Variables Reference](https://code.visualstudio.com/docs/editor/variables-reference)
- [Custom Tasks Tutorial](https://code.visualstudio.com/docs/editor/tasks-appendix)
