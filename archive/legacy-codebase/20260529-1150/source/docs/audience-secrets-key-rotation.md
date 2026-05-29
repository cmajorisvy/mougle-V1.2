# Rotating `AUDIENCE_GATEWAY_SECRETS_KEY`

The per-connector platform access tokens stored in
`audience_connector_secrets` are encrypted at rest with AES-256-GCM using
the master key in `AUDIENCE_GATEWAY_SECRETS_KEY`. If that key is rotated
without re-encrypting the stored rows, the audience platform gateway
fails closed (`platform_token_missing`) for every connector. Use the
script below to swap the master key cleanly.

## Procedure

1. Generate the new 32-byte key (hex or base64) and stash it locally — do
   not put it in Replit Secrets yet.
2. From the workspace, run the rotation script in dry-run mode first:

   ```bash
   tsx scripts/rotate-audience-secrets-key.ts \
     --old="$CURRENT_AUDIENCE_GATEWAY_SECRETS_KEY" \
     --new="$NEW_AUDIENCE_GATEWAY_SECRETS_KEY" \
     --dry-run
   ```

   The script prints a summary `{ total, rotated, skipped, failed,
   nextKeyVersion }`. `failed` must be `0` — any failure aborts the
   transaction and leaves every row untouched.

3. Re-run without `--dry-run` to actually re-encrypt. The whole sweep
   runs inside a single transaction, so a failure mid-rotation rolls
   back. Rerunning the command after a partial or successful rotation is
   safe: rows already readable with the new key are reported as
   `skipped`.

4. Update Replit Secrets:
   - `AUDIENCE_GATEWAY_SECRETS_KEY` → the new key
   - `AUDIENCE_GATEWAY_SECRETS_KEY_VERSION` → the `nextKeyVersion` value
     reported by the script (defaults to `1` when unset)

5. Restart the `Start application` workflow so the audience platform
   gateway picks up the new key.

## Notes

- The script never logs plaintext tokens; only counts and connector ids
  appear in its output.
- Connectors that cannot be decrypted with the supplied `--old` key are
  reported by id in `failedConnectorIds`; rotate or re-issue those
  tokens by hand before retrying.
- Tests: `tests/audience-secrets-key-rotation.test.ts`.
