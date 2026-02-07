# Database Migration Guide

## Understanding the Hanging Issue

### The Problem
When running database setup scripts, they would **hang indefinitely** at the migration step. This happens because `pnpm db:migrate` (which runs `prisma migrate dev`) is an **interactive command** that waits for user input.

### Why It Hangs
`prisma migrate dev` requires:
1. User to provide a migration name (if schema changes detected)
2. Confirmation prompts for certain operations
3. Terminal input/output for status updates

When run in automated scripts without proper terminal handling, it freezes waiting for stdin.

## Solutions

### ✅ For Automated Scripts (RECOMMENDED)
Use `prisma migrate deploy` which is **non-interactive**:

```powershell
cd packages\database
pnpm db:migrate:deploy
```

This is what the setup scripts now use. It applies existing migrations without prompting.

### ✅ For Manual Development
When creating NEW migrations during development:

```powershell
cd packages\database
pnpm db:migrate -- --name your_migration_name
```

Or use the interactive mode (but only manually):
```powershell
pnpm db:migrate
# It will prompt: "Enter a name for the migration:"
```

### ✅ For CI/CD Pipelines
Always use `deploy` mode:
```yaml
- name: Run migrations
  run: pnpm db:migrate:deploy
  working-directory: packages/database
```

## Complete Workflow

### Initial Database Setup
```powershell
# 1. Run the setup script (now fixed to use deploy)
.\setup-db-interactive.ps1

# OR manually:
cd packages\database

# 2. Generate Prisma client
pnpm db:generate

# 3. Apply existing migrations (non-interactive)
pnpm db:migrate:deploy
```

### Creating a New Migration
```powershell
cd packages\database

# 1. Edit schema.prisma
# 2. Generate and apply migration with a name
pnpm db:migrate -- --name add_new_feature

# 3. This creates a new migration file in prisma/migrations/
# 4. Commits it to git
```

### Applying Migrations After Pull
```powershell
cd packages\database

# After pulling new migrations from git:
pnpm db:generate       # Update Prisma client
pnpm db:migrate:deploy # Apply new migrations
```

## Available Commands

From `packages/database/`:

| Command | Purpose | Interactive? | Use Case |
|---------|---------|--------------|----------|
| `pnpm db:generate` | Generate Prisma client | No | After schema changes |
| `pnpm db:migrate` | Create + apply migration | **YES** | Development only (manual) |
| `pnpm db:migrate:deploy` | Apply existing migrations | No | Scripts, CI/CD, production |
| `pnpm db:seed` | Seed database | No | Add test data |
| `pnpm db:studio` | Open Prisma Studio GUI | No | Visual DB browsing |

## Troubleshooting

### "Script is hanging at migration step"
**Solution:** Script is using `db:migrate` instead of `db:migrate:deploy`. Update to use deploy mode.

### "Migration failed with errors"
```powershell
# Check current migration status
cd packages\database
npx prisma migrate status

# Reset database (CAUTION: Deletes all data)
npx prisma migrate reset
```

### "Prisma client is out of date"
```powershell
cd packages\database
pnpm db:generate
```

### "Cannot find module '@prisma/client'"
```powershell
# From project root:
pnpm install
cd packages\database
pnpm db:generate
```

## Best Practices

1. **Never use `db:migrate` in scripts** - It's interactive
2. **Always use `db:migrate:deploy` for automation** - It's non-interactive
3. **Name your migrations descriptively** - e.g., `add_product_types`, not `update1`
4. **Commit migrations to git** - They're part of your schema history
5. **Run `db:generate` after schema changes** - Updates TypeScript types
6. **Test migrations on a copy first** - Especially for production

## Environment Setup

Ensure your `.env` file has the correct DATABASE_URL:

```env
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/ptcg_carddb?schema=public"
```

## References

- [Prisma Migrate Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Prisma Deploy Documentation](https://www.prisma.io/docs/reference/api-reference/command-reference#migrate-deploy)
- Project setup: [IMPLEMENTATION.md](IMPLEMENTATION.md)
