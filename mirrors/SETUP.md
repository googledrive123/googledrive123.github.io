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
