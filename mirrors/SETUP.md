# Adding a backup address

Each backup address is a GitHub account holding forks of the site and every vault.
For an account called `NAME`, the address is `https://NAME.github.io`.

1. Make the account and sign in as it.
2. Fork `googledrive123/googledrive123.github.io` and rename the fork to `NAME.github.io`.
3. Fork every `googledrive123/vaultN` repo, keeping the names.
4. In every fork: Actions tab, enable workflows (forks start with them off).
   Settings, Pages: deploy from branch `main`, folder `/`.
5. Optional: a classic token with the `repo` and `workflow` scopes, saved in each fork as
   the secret `SYNC_TOKEN`. Without it, syncing stops the day `sync.yml` itself changes.
6. Run "Sync from GameVault" once by hand in every fork, then open `https://NAME.github.io`.
7. Add `https://NAME.github.io` in the dashboard. From then on it shows on /mirrors/ and
   the database answers it like the main site.

Steps 2, 3, 4 and 6 from a terminal, signed in to `gh` as the new account:

```sh
NAME=newaccount
gh repo fork googledrive123/googledrive123.github.io --fork-name "$NAME.github.io" --clone=false
for r in $(gh repo list googledrive123 --limit 200 --json name --jq '.[].name | select(test("^vault[0-9]+$"))'); do
  gh repo fork "googledrive123/$r" --clone=false
done
sleep 60   # new forks take a moment to fill in
for r in "$NAME.github.io" $(gh repo list "$NAME" --limit 200 --json name --jq '.[].name | select(test("^vault[0-9]+$"))'); do
  gh api -X PUT "repos/$NAME/$r/actions/workflows/sync.yml/enable"
  gh api -X POST "repos/$NAME/$r/pages" -f 'source[branch]=main' -f 'source[path]=/'
  gh workflow run sync.yml -R "$NAME/$r"
done
```

Good to know:

- Every original repo has to carry `.github/workflows/sync.yml`, so every fork gets it.
- GitHub switches off scheduled workflows after 60 days without activity in a repo.
  If a copy falls behind, turn the workflow back on in its Actions tab or run it by hand.
- Pushing `.github/workflows/sync.yml` needs a token with the `workflow` scope:
  `gh auth refresh -s workflow`.
- Progress, sign-in and settings belong to each address. Players carry their progress
  over with "Move my saves there" on /mirrors/.
