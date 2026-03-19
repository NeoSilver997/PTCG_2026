// scripts/copilot-agent.js
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class ProjectAwareCopilotAgent {
  constructor(model = 'deepseek-coder-v2:16b') {
    this.model = model;
    this.projectContext = this.detectProject();
  }

  detectProject() {
    const cwd = process.cwd();
    
    // Detect PTCG_2026 (monorepo with pnpm workspaces)
    if (fs.existsSync('packages/database/prisma/schema.prisma')) {
      return {
        name: 'PTCG_2026',
        type: 'monorepo',
        architecture: 'TypeScript monorepo with NestJS API (port 4000) + Next.js frontend (port 3001)',
        database: 'PostgreSQL with Prisma ORM',
        keyPatterns: [
          'Multi-language card system (PrimaryCard + language variants)',
          'webCardId format (hk00014744, jp49355)',
          'Direct database import via import-cards-direct.ts',
          'JSON null vs SQL NULL patterns for JSONB fields',
          'Workspace packages: @ptcg/database, @ptcg/shared-types'
        ]
      };
    }
    
    // Detect PTCG_CardDB (simple structure with numbered dirs)
    if (fs.existsSync('0_Database/pokemon_cards.db') || 
        fs.existsSync('1_Webscraper')) {
      return {
        name: 'PTCG_CardDB',
        type: 'single-repo',
        architecture: 'Python scrapers → SQLite → Next.js GUI (port 3333)',
        database: 'Single SQLite file (pokemon_cards.db)',
        keyPatterns: [
          'Numbered directories: 1_Webscraper, 2_ExtractData, 5_PrivateGUI',
          'Selenium-based tournament scraping',
          'INSERT OR IGNORE pattern for duplicate prevention',
          'Dynamic tournament table creation',
          'config.py for all paths and settings'
        ]
      };
    }
    
    return {
      name: 'Unknown',
      type: 'unknown',
      architecture: 'Unable to detect project structure',
      database: 'Unknown',
      keyPatterns: []
    };
  }

  buildProjectContext() {
    const ctx = this.projectContext;
    return `
PROJECT CONTEXT:
- Name: ${ctx.name}
- Type: ${ctx.type}
- Architecture: ${ctx.architecture}
- Database: ${ctx.database}
${ctx.keyPatterns.length > 0 ? `- Key Patterns:\n${ctx.keyPatterns.map(p => '  * ' + p).join('\n')}` : ''}
`;
  }

  async analyzeFile(filePath, analysisType = 'comprehensive') {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    const fileExt = path.extname(filePath);
    const relativePath = path.relative(process.cwd(), filePath);

    // Detect file type and context
    const fileContext = this.detectFileContext(relativePath, fileContent, fileExt);

    // Truncate large files
    const maxLength = 12000;
    const truncated = fileContent.length > maxLength;
    const content = truncated ? 
      fileContent.substring(0, maxLength) + '\n...[TRUNCATED FOR ANALYSIS]' : 
      fileContent;

    let prompt = this.buildPrompt(
      fileName,
      relativePath,
      content,
      fileExt,
      fileContext,
      analysisType
    );

    if (truncated) {
      prompt += '\n\nNOTE: File was truncated due to length. Focus analysis on the visible portion.';
    }

    console.log(`🤖 Copilot Agent (${this.projectContext.name}) analyzing: ${relativePath}`);
    console.log('=' .repeat(70));

    const analysis = await this.callLLM(prompt);
    
    // Save analysis with project context
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFile = `${fileName}_analysis_${timestamp}.md`;
    const fullAnalysis = `# ${this.projectContext.name} Copilot Agent Analysis

**File:** ${relativePath}
**Project:** ${this.projectContext.name} (${this.projectContext.type})
**Analysis Type:** ${analysisType}
**Model:** ${this.model}
**Date:** ${new Date().toISOString()}
**File Type:** ${fileContext.type}

---

${analysis}`;
    
    fs.writeFileSync(outputFile, fullAnalysis);
    console.log(`\n💾 Analysis saved to: ${outputFile}`);
    
    return analysis;
  }

  detectFileContext(relativePath, content, fileExt) {
    // PTCG_2026 specific patterns
    if (relativePath.includes('apps/api')) {
      if (relativePath.includes('.controller.ts')) return { type: 'NestJS Controller', layer: 'API' };
      if (relativePath.includes('.service.ts')) return { type: 'NestJS Service', layer: 'Business Logic' };
      if (relativePath.includes('/dto/')) return { type: 'DTO (Data Transfer Object)', layer: 'Validation' };
    }
    if (relativePath.includes('apps/web')) {
      if (relativePath.includes('page.tsx')) return { type: 'Next.js Page Component', layer: 'Frontend' };
      if (relativePath.includes('components/')) return { type: 'React Component', layer: 'UI' };
    }
    if (relativePath.includes('packages/database')) {
      if (relativePath.includes('schema.prisma')) return { type: 'Prisma Schema', layer: 'Data Model' };
    }
    if (relativePath.includes('scrapers/')) {
      if (content.includes('japanese_card_scraper')) return { type: 'Japanese Card Scraper', layer: 'Data Ingestion' };
      if (content.includes('import-cards-direct')) return { type: 'Direct DB Import Script', layer: 'Data Migration' };
    }

    // PTCG_CardDB specific patterns
    if (relativePath.includes('1_Webscraper')) return { type: 'Selenium Scraper', layer: 'Data Collection' };
    if (relativePath.includes('2_ExtractData')) return { type: 'Data Import Script', layer: 'ETL' };
    if (relativePath.includes('5_PrivateGUI')) {
      if (relativePath.includes('api/')) return { type: 'Next.js API Route', layer: 'Backend' };
      if (relativePath.includes('components/')) return { type: 'React Component', layer: 'UI' };
    }
    if (relativePath.includes('config.py')) return { type: 'Configuration File', layer: 'Settings' };

    // Generic patterns
    if (fileExt === '.prisma') return { type: 'Prisma Schema', layer: 'Data Model' };
    if (fileExt === '.py') return { type: 'Python Script', layer: 'Scripting' };
    if (fileExt === '.ts' || fileExt === '.tsx') return { type: 'TypeScript File', layer: 'Application' };
    if (fileExt === '.json') return { type: 'JSON Data', layer: 'Configuration/Data' };
    if (fileExt === '.txt') return { type: 'Text/Log File', layer: 'Data' };

    return { type: 'Unknown', layer: 'Unknown' };
  }

  buildPrompt(fileName, relativePath, content, fileExt, fileContext, analysisType) {
    const projectCtx = this.buildProjectContext();
    const basePrompt = `You are GitHub Copilot analyzing a file in the ${this.projectContext.name} project.

${projectCtx}

FILE INFO:
- Name: ${fileName}
- Path: ${relativePath}
- Extension: ${fileExt}
- Detected Type: ${fileContext.type}
- Layer: ${fileContext.layer}

CONTENT:
\`\`\`${fileExt.replace('.', '')}
${content}
\`\`\`

`;

    switch (analysisType) {
      case 'code-review':
        return basePrompt + this.getCodeReviewPrompt();
      case 'architecture':
        return basePrompt + this.getArchitecturePrompt();
      case 'bug-hunt':
        return basePrompt + this.getBugHuntPrompt();
      case 'migration':
        return basePrompt + this.getMigrationPrompt();
      default:
        return basePrompt + this.getComprehensivePrompt();
    }
  }

  getComprehensivePrompt() {
    if (this.projectContext.name === 'PTCG_2026') {
      return `ANALYSIS REQUEST (PTCG_2026 Context):
Provide a comprehensive analysis covering:

1. **Purpose & Functionality**: What does this file do in the PTCG_2026 ecosystem?
2. **Architecture & Patterns**: Design patterns, architectural decisions (NestJS modules, Prisma relations, React hooks)
3. **Multi-Language Card System**: How does this interact with PrimaryCard/Card/RegionalExpansion models?
4. **Database Access**: Prisma queries, JSONB field handling, JSON null vs SQL NULL patterns
5. **Workspace Integration**: Usage of @ptcg/database, @ptcg/shared-types packages
6. **API Endpoints**: If applicable, what REST endpoints this implements
7. **Data Validation**: class-validator DTOs, input sanitization
8. **Testing**: Testability, existing test coverage, Jest/React Testing Library patterns
9. **Performance**: Pagination, caching, N+1 query prevention
10. **Security**: Rate limiting, XSS prevention, parameterized queries
11. **Improvements**: Refactoring suggestions following PTCG_2026 conventions
12. **Integration**: How this fits with NestJS API (port 4000) and Next.js frontend (port 3001)

Follow PTCG_2026 conventions: @unique constraints, JSONB patterns, direct import scripts, workspace package usage.`;
    }

    if (this.projectContext.name === 'PTCG_CardDB') {
      return `ANALYSIS REQUEST (PTCG_CardDB Context):
Provide a comprehensive analysis covering:

1. **Purpose & Functionality**: What does this file do in the PTCG_CardDB pipeline?
2. **Data Flow**: How does this fit into: Scraper → JSON/CSV → SQLite → Next.js API → UI?
3. **Database Patterns**: SQLite usage, INSERT OR IGNORE, transaction patterns, config.py paths
4. **Scraping Strategy**: Selenium automation, rate limiting, error handling, data caching
5. **Duplicate Prevention**: How duplicates are handled (INSERT OR IGNORE, ON CONFLICT)
6. **Next.js Integration**: API routes, database connection pattern, environment variables
7. **Configuration**: Usage of config.py, hardcoded paths (anti-pattern), environment setup
8. **Migration Logic**: Column existence checks, ALTER TABLE patterns
9. **Testing**: Error handling, validation, edge cases
10. **Performance**: Database optimization, WAL mode, foreign keys
11. **Improvements**: Refactoring suggestions following PTCG_CardDB conventions
12. **Cross-Repo**: Integration with PTCG_CardDB_Tc or ptcg-product-info

Follow PTCG_CardDB conventions: config.py paths, pokemon_cards.db single DB, numbered directories.`;
    }

    return `Provide a comprehensive file analysis with architecture, patterns, and improvement suggestions.`;
  }

  getCodeReviewPrompt() {
    const specificChecks = this.projectContext.name === 'PTCG_2026' 
      ? `- PTCG_2026 specific: @Transform for boolean DTOs, JSONB 'null'::jsonb patterns, workspace package imports
- Prisma best practices: select/include optimization, @@unique constraints
- NestJS patterns: PrismaService injection, rate limiting decorators`
      : `- PTCG_CardDB specific: config.py usage, INSERT OR IGNORE patterns, connection.execute("PRAGMA foreign_keys = ON")
- SQLite best practices: WAL mode, transaction usage
- Next.js API patterns: dbPath from env var, proper error handling`;

    return `CODE REVIEW REQUEST:
Perform a detailed code review focusing on:

**General Quality:**
- Code readability and maintainability
- Proper error handling and edge cases
- Type safety (TypeScript/Python type hints)
- Security vulnerabilities

**Project-Specific:**
${specificChecks}

**Performance:**
- Database query efficiency
- Proper pagination/limits
- Caching opportunities

**Testing:**
- Test coverage gaps
- Missing edge case tests

Provide specific, actionable feedback with code examples for improvements.`;
  }

  getArchitecturePrompt() {
    return `ARCHITECTURAL ANALYSIS REQUEST:
Analyze the architectural patterns and design:

1. **Component Responsibilities**: Single Responsibility Principle adherence
2. **Design Patterns**: Identified patterns (Factory, Repository, etc.)
3. **Project Integration**: How this fits with ${this.projectContext.name} architecture
4. **Scalability**: Can this handle growth? Bottlenecks?
5. **Maintainability**: Code organization, coupling, cohesion
6. **Suggested Improvements**: Architectural refactoring opportunities

Reference ${this.projectContext.name} conventions and existing patterns.`;
  }

  getBugHuntPrompt() {
    const specificBugs = this.projectContext.name === 'PTCG_2026'
      ? `- JSONB field queries using IS NULL instead of = 'null'::jsonb
- Boolean query params not using @Transform decorator
- Missing pnpm db:generate after schema changes
- Foreign key missing onDelete: Cascade`
      : `- Hardcoded paths instead of config.py
- Missing "PRAGMA foreign_keys = ON"
- Duplicate inserts without INSERT OR IGNORE
- Missing transaction wrappers for atomic operations`;

    return `BUG HUNTING REQUEST:
Hunt for potential bugs and issues:

**Common Issues:**
- Null/undefined reference errors
- Type mismatches
- Database query problems
- Race conditions or async issues
- Memory leaks
- Validation bypasses
- Security vulnerabilities

**Project-Specific Bugs:**
${specificBugs}

For each potential issue:
- Describe the problem
- Show the problematic code
- Severity level (Critical/High/Medium/Low)
- Suggested fix with code example`;
  }

  getMigrationPrompt() {
    return `MIGRATION ANALYSIS REQUEST:
This file appears to be related to data migration or schema changes.

Analyze:
1. **Migration Safety**: Is this migration reversible? Data loss risks?
2. **Compatibility**: Backward compatibility with existing data?
3. **Performance**: Migration performance on large datasets
4. **Testing**: How to test this migration safely?
5. **Rollback Plan**: What if migration fails mid-way?
6. **Best Practices**: Following ${this.projectContext.name} migration patterns

Provide specific recommendations for safe deployment.`;
  }

  async callLLM(prompt) {
    return new Promise((resolve, reject) => {
      // Write prompt to temp file to avoid shell escaping issues
      const tempFile = path.join(process.cwd(), '.copilot-prompt-temp.txt');
      fs.writeFileSync(tempFile, prompt, 'utf8');
      
      // Use PowerShell's Get-Content for reliable file piping
      const command = process.platform === 'win32'
        ? `Get-Content "${tempFile}" | ollama run ${this.model}`
        : `cat "${tempFile}" | ollama run ${this.model}`;
      
      exec(command, { 
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        cwd: process.cwd(),
        shell: process.platform === 'win32' ? 'powershell.exe' : true
      }, (error, stdout, stderr) => {
        // Clean up temp file
        try { fs.unlinkSync(tempFile); } catch (e) {}
        
        if (error) {
          console.error('LLM Error:', stderr);
          reject(error);
          return;
        }
        
        resolve(stdout.trim());
      });
    });
  }
}

// CLI interface
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('Usage: node scripts/copilot-agent.js <file-path> [analysis-type]');
  console.log('');
  console.log('Analysis types:');
  console.log('  comprehensive  - Full analysis (default)');
  console.log('  code-review    - Code quality review');
  console.log('  architecture   - Architectural analysis');
  console.log('  bug-hunt       - Bug detection');
  console.log('  migration      - Migration safety analysis');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/copilot-agent.js apps/api/src/cards/cards.service.ts');
  console.log('  node scripts/copilot-agent.js 1_Webscraper/jpevents_scraper.py code-review');
  console.log('  node scripts/copilot-agent.js packages/database/prisma/schema.prisma architecture');
  process.exit(1);
}

const filePath = args[0];
const analysisType = args[1] || 'comprehensive';
const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

const agent = new ProjectAwareCopilotAgent();

console.log(`\n🔍 Detected Project: ${agent.projectContext.name} (${agent.projectContext.type})`);
console.log(`📊 Database: ${agent.projectContext.database}\n`);

agent.analyzeFile(absolutePath, analysisType)
  .then(() => {
    console.log('\n✅ Analysis complete!');
  })
  .catch(error => {
    console.error('\n❌ Analysis failed:', error.message);
    process.exit(1);
  });
