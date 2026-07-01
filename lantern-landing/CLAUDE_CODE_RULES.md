# Rules for Claude Code — follow strictly every session

## Branch
- Work ONLY on main. Never create feature branches.
- If not on main: `git checkout main` first

## Before saying done
- Run `npm run build` from lantern-landing/
- If build fails, fix before reporting done
- If installing a new package, commit package.json AND package-lock.json

## Never commit
- .claude/worktrees/
- lantern-landing/scripts/fsq/output/
- lantern-landing/scripts/overture/output/
- .env.local

## Deploy sequence
```bash
cd lantern-landing
npm run build
git add -A
git commit -m "clear message"
git push origin main
```

Vercel auto-deploys on push to main. No manual deploy command needed.

## After confirmed working deploy
```bash
git tag deploy-$(date +%Y-%m-%d)-working
git push origin --tags
```

## If merge conflict appears
STOP and ask user. Do not attempt to resolve.
