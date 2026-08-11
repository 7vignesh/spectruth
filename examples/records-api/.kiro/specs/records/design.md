# Records API — Design

## Overview

A single Express-style router over a record store.

## Authorization

Requirement 1 requires that a delete is refused unless the caller owns the
record. Ownership is established by comparing the record's `ownerId` with the
authenticated user id, and a refusal returns 403.

## Pagination

Requirement 2 caps page size at 50 records.
