# Project-Aware Copilot Agent

A local LLM-powered code analysis agent that understands your PTCG project structure and conventions. Uses Ollama to provide GitHub Copilot-style file analysis with context-aware insights tailored to PTCG_2026 and PTCG_CardDB projects.

## Features

✅ **Auto-detects project type** (PTCG_2026 monorepo vs PTCG_CardDB single-repo)  
✅ **Context-aware analysis** following project-specific conventions  
✅ **Multiple analysis modes** (comprehensive, code review, architecture, bug hunt, migration)  
✅ **File type detection** (NestJS controllers, Prisma schemas, React components, Python scrapers, etc.)  
✅ **VS Code integration** via tasks and keyboard shortcuts  
✅ **Local & private** - all analysis stays on your machine  
✅ **Automated reports** - saves markdown files with timestamps  

## Prerequisites

### 1. Install Ollama

```bash
# Download from https://ollama.ai/download
# Or on Windows with winget:
winget install Ollama.Ollama
```

### 2. Pull a Model

```bash
# Default model (large, high quality)
ollama pull deepseek-coder-v2:16b

# Alternative smaller/faster models:
ollama pull llama3.2:3b      # Balanced speed and quality
ollama pull codellama:7b     # Code-focused
ollama pull mistral:7b       # General purpose
```

### 3. Verify Installation

```bash
ollama list
# Should show your installed models
```

## Quick Start

### Method 1: VS Code Tasks (Recommended)

1. **Open any file** in your PTCG workspace
2. Press **Ctrl+Shift+P** (Command Palette)
3. Type: `Tasks: Run Task`
4. Select your analysis type:
   - **Copilot Agent: Analyze Current File** (comprehensive)
   - **Copilot Agent: Code Review**
   - **Copilot Agent: Architecture Analysis**
   - **Copilot Agent: Bug Hunt**
   - **Copilot Agent: Migration Analysis**
5. View results in VS Code terminal
6. Analysis automatically saved as `<filename>_analysis_<timestamp>.md`

### Method 2: Command Line

```bash
# Basic usage (opens current directory)
node scripts/copilot-agent.js <file-path> [analysis-type]

# Examples:
node scripts/copilot-agent.js sample-battle-log-3.txt
node scripts/copilot-agent.js apps/api/src/cards/cards.service.ts code-review
node scripts/copilot-agent.js packages/database/prisma/schema.prisma architecture
node scripts/copilot-agent.js scrapers/import-cards-direct.ts bug-hunt
```

## Analysis Types

### 1. Comprehensive (Default)
Full analysis covering purpose, architecture, patterns, database access, testing, performance, security, and improvement suggestions.

**Use when:** You want a complete understanding of a file

```bash
node scripts/copilot-agent.js apps/api/src/battles/battle-log-parser.ts
```

### 2. Code Review
Detailed code quality review focusing on readability, maintainability, type safety, security, and project-specific conventions.

**Use when:** You need feedback on code quality before committing

```bash
node scripts/copilot-agent.js apps/web/src/app/cards/page.tsx code-review
```

### 3. Architecture Analysis
Examines design patterns, component responsibilities, scalability, maintainability, and integration with project architecture.

**Use when:** Evaluating architectural decisions or refactoring

```bash
node scripts/copilot-agent.js packages/database/prisma/schema.prisma architecture
```

### 4. Bug Hunt
Hunts for potential bugs, null references, type mismatches, database issues, race conditions, and project-specific anti-patterns.

**Use when:** Debugging or looking for hidden issues

```bash
node scripts/copilot-agent.js scrapers/japanese_card_scraper.py bug-hunt
```

### 5. Migration Analysis
Analyzes data migration safety, compatibility, performance, rollback plans, and best practices.

**Use when:** Planning database migrations or schema changes

```bash
node scripts/copilot-agent.js packages/database/migrations/20260101_add_battle_logs.sql migration
```

## Project Detection

The agent automatically detects which PTCG project you're working in:

### PTCG_2026 (Monorepo)
- **Identifier:** Presence of `packages/database/prisma/schema.prisma`
- **Architecture:** TypeScript monorepo with NestJS API (port 4000) + Next.js frontend (port 3001)
- **Database:** PostgreSQL with Prisma ORM
- **Key Patterns:**
  - Multi-language card system (PrimaryCard + language variants)
  - webCardId format (hk00014744, jp49355)
  - Direct database import via import-cards-direct.ts
  - JSON null vs SQL NULL patterns for JSONB fields
  - Workspace packages: @ptcg/database, @ptcg/shared-types

### PTCG_CardDB (Single-Repo)
- **Identifier:** Presence of `0_Database/pokemon_cards.db` or `1_Webscraper/`
- **Architecture:** Python scrapers → SQLite → Next.js GUI (port 3333)
- **Database:** Single SQLite file (pokemon_cards.db)
- **Key Patterns:**
  - Numbered directories: 1_Webscraper, 2_ExtractData, 5_PrivateGUI
  - Selenium-based tournament scraping
  - INSERT OR IGNORE pattern for duplicate prevention
  - Dynamic tournament table creation
  - config.py for all paths and settings

## File Type Detection

The agent recognizes different file types and provides context-specific analysis:

| Pattern | Detected Type | Layer |
|---------|---------------|-------|
| `apps/api/*.controller.ts` | NestJS Controller | API |
| `apps/api/*.service.ts` | NestJS Service | Business Logic |
| `apps/api/*/dto/*.ts` | DTO | Validation |
| `apps/web/**/page.tsx` | Next.js Page | Frontend |
| `apps/web/components/*.tsx` | React Component | UI |
| `packages/database/schema.prisma` | Prisma Schema | Data Model |
| `scrapers/*.py` | Python Scraper | Data Ingestion |
| `1_Webscraper/*.py` | Selenium Scraper | Data Collection |
| `2_ExtractData/*.py` | Import Script | ETL |
| `5_PrivateGUI/api/*.ts` | Next.js API Route | Backend |

## Example Output

```markdown
# PTCG_2026 Copilot Agent Analysis

**File:** apps/api/src/cards/cards.service.ts
**Project:** PTCG_2026 (monorepo)
**Analysis Type:** code-review
**Model:** deepseek-coder-v2:16b
**Date:** 2026-02-08T12:34:56.789Z
**File Type:** NestJS Service

---

## Code Review Analysis

### Overall Quality: 8/10

**Strengths:**
- Proper dependency injection of PrismaService
- Good error handling with custom exceptions
- Type-safe Prisma queries with proper includes
- Pagination implemented correctly

**Issues Found:**

#### 1. JSONB Field Query Pattern (Medium)
**Location:** Line 45-48
**Problem:** Using `IS NULL` for JSONB field instead of `= 'null'::jsonb`

```typescript
// Current (incorrect):
where: { abilities: null }

// Should be (for PostgreSQL JSONB):
where: { abilities: Prisma.DbNull }
```

#### 2. Missing @Transform Decorator (Low)
**Location:** Line 23
**Problem:** Boolean query parameter not properly transformed from string

[... detailed analysis continues ...]
```

## Configuration

### Change Model

Edit the script at line 7:

```javascript
// Default model
constructor(model = 'deepseek-coder-v2:16b') {

// Change to faster model
constructor(model = 'llama3.2:3b') {
```

Or pass as environment variable:

```bash
COPILOT_MODEL=llama3.2:3b node scripts/copilot-agent.js myfile.ts
```

### Adjust File Size Limits

Edit line 45 to change truncation threshold:

```javascript
const maxLength = 12000;  // Increase for larger files
```

## Keyboard Shortcuts (Optional)

Add to `.vscode/keybindings.json`:

```json
[
  {
    "key": "ctrl+shift+a",
    "command": "workbench.action.tasks.runTask",
    "args": "Copilot Agent: Analyze Current File"
  },
  {
    "key": "ctrl+shift+r",
    "command": "workbench.action.tasks.runTask",
    "args": "Copilot Agent: Code Review"
  },
  {
    "key": "ctrl+shift+b",
    "command": "workbench.action.tasks.runTask",
    "args": "Copilot Agent: Bug Hunt"
  }
]
```

## Troubleshooting

### Error: "Ollama not found"

**Solution:** Ensure Ollama is installed and running:
```bash
ollama serve
```

### Error: "Model not found"

**Solution:** Pull the model first:
```bash
ollama pull deepseek-coder-v2:16b
```

### Analysis is too slow

**Solution:** Switch to a faster model:
```bash
ollama pull llama3.2:3b
# Then update the script to use this model
```

### Generic or unhelpful responses

**Possible causes:**
- Model context window too small for file
- File was truncated (check output for "[TRUNCATED]" message)
- LLM needs more specific prompts

**Solutions:**
- Use a model with larger context window
- Split large files into smaller sections
- Try different analysis types for varied perspectives

### File analysis saved but not visible in VS Code

**Solution:** Refresh file explorer (right-click → Refresh) or press F5

### Command not recognized in PowerShell

**Solution:** Ensure Node.js is in your PATH:
```powershell
node --version
# Should output: v18.x.x or higher
```

## Project-Specific Analysis Rules

### PTCG_2026 Focuses On:
- ✅ Multi-language card system interactions
- ✅ Prisma query optimization (select/include)
- ✅ JSONB field handling patterns
- ✅ Workspace package usage (@ptcg/*)
- ✅ NestJS module structure
- ✅ Rate limiting decorators
- ✅ class-validator DTOs
- ✅ @Transform decorators for boolean params

### PTCG_CardDB Focuses On:
- ✅ config.py path usage
- ✅ SQLite transaction patterns
- ✅ INSERT OR IGNORE duplicate prevention
- ✅ PRAGMA foreign_keys enforcement
- ✅ Selenium scraping patterns
- ✅ Next.js API route database connections
- ✅ Dynamic table creation logic
- ✅ WAL mode optimization

## Advanced Usage

### Batch Analysis

Analyze multiple files at once:

```bash
# PowerShell
Get-ChildItem apps/api/src/**/*.service.ts | ForEach-Object { 
  node scripts/copilot-agent.js $_.FullName code-review 
}

# Bash
find apps/api/src -name "*.service.ts" -exec node scripts/copilot-agent.js {} code-review \;
```

### Integration with Git Hooks

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/sh
# Analyze staged TypeScript files before commit
git diff --cached --name-only --diff-filter=ACM | grep ".ts$" | while read file; do
  node scripts/copilot-agent.js "$file" bug-hunt
done
```

### Custom Analysis Prompts

Extend the script to add custom analysis types by modifying the `buildPrompt` method.

## Performance Tips

1. **Use appropriate models:**
   - Development: `llama3.2:3b` (fast, good enough)
   - Production review: `deepseek-coder-v2:16b` (slow, high quality)

2. **Limit file size:**
   - Script auto-truncates files >12KB
   - For large files, analyze sections separately

3. **Batch similar files:**
   - Analyze all controllers together
   - Consistent analysis type for file categories

4. **Cache results:**
   - Analysis files are timestamped and saved
   - Reuse previous analysis if file unchanged

## Privacy & Security

✅ **All processing is local** - no data sent to external services  
✅ **No API costs** - runs entirely on your machine  
✅ **No rate limits** - analyze as many files as you want  
✅ **Source code stays private** - perfect for proprietary projects  

## Contributing

To extend the agent:

1. **Add new analysis types:** Modify `buildPrompt()` method
2. **Add file type patterns:** Update `detectFileContext()` method
3. **Add project detection:** Update `detectProject()` method
4. **Customize prompts:** Edit `getComprehensivePrompt()` and similar methods

## License

This script is part of the PTCG_2026 project. See project LICENSE file.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Review Ollama documentation: https://ollama.ai/docs
3. Check project Copilot instructions: `.github/copilot-instructions.md`

---

**Happy Coding with AI! 🤖**
