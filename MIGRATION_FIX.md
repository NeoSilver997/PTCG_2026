# Quick Fix: Database Migration Hanging

## The Issue
Scripts hang when running `pnpm db:migrate` because it's an **interactive command** that waits for user input.

## The Fix

### ✅ In Setup Scripts (FIXED)
Both `setup-db-interactive.ps1` and `setup-database.ps1` now use:
```powershell
pnpm db:migrate:deploy   # Non-interactive
```

### ✅ Manual Commands
```powershell
# For applying existing migrations (scripts, automation)
cd packages\database
pnpm db:migrate:deploy

# For creating NEW migrations (manual development only)
pnpm db:migrate -- --name your_migration_name
```

## Quick Commands

| Task | Command | Interactive? |
|------|---------|--------------|
| Apply migrations | `pnpm db:migrate:deploy` | ❌ No |
| Create migration | `pnpm db:migrate -- --name X` | ✅ Yes |
| Generate client | `pnpm db:generate` | ❌ No |
| Check status | `npx prisma migrate status` | ❌ No |

## Remember
- **Scripts/CI**: Always use `db:migrate:deploy`
- **Development**: Use `db:migrate -- --name X`
- **After schema changes**: Run `db:generate`

📖 Full guide: [DATABASE_MIGRATION_GUIDE.md](DATABASE_MIGRATION_GUIDE.md)
