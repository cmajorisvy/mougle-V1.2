# Phase 36C15 - Credential Storage Governance Plan, No Secrets

## Status

Documentation only. No credentials are read, created, stored, printed, changed, or validated.

## Current Boundary

This phase defines future credential governance for provider-adjacent work. It does not inspect `.env`, add credentials, change deployment settings, call providers, add adapters, add workers, change schema, or modify package files.

## Secret Storage Requirements

Future credentials must:

- live outside the repository
- never appear in source files
- never appear in package views
- never appear in public/user surfaces
- never appear in non-debug admin surfaces
- never appear in logs or audit records
- be scoped by environment
- be rotatable
- be revocable
- be root-admin governed

## Redaction Requirements

Future credential-adjacent systems must redact:

- keys
- tokens
- organization identifiers
- project identifiers
- endpoints when they reveal provider identity
- routing details
- fallback details
- environment values

## Access Boundary

Only explicitly approved internal runtime code may access credentials in a future phase.

Admin package views, council outputs, ledger proposals, public copy, scripts, captions, and dry-run artifacts must not expose credential context.

## Rotation and Incident Response

Future implementation must define:

- rotation schedule
- revocation process
- incident owner
- audit review path
- emergency disable path
- safe mode integration
- root-admin override logging

## Tooltip and Learning Requirements

Any future admin secret-status UI must include tooltips for secret scope, rotation, redaction, safe mode, and incident response.

Bottom learning sections must include:

- How to use this
- What this means
- How it works
- What cannot happen from this screen

## How to Use This

Use this plan to review future credential handling before any provider pilot or adapter work begins.

## What This Means

Mougle can design credential safety without storing or exposing secrets in the repo.

## How It Works

Credentials stay outside source-controlled code. Future runtime access must be scoped, redacted, audited, rotatable, and stoppable by safe mode.

## What Cannot Happen From This Design

This design cannot read `.env`, reveal secrets, configure providers, call external systems, or authorize provider pilots.
