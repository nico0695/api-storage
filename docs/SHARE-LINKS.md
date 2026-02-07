# File Sharing Links

## Overview

Generate public, secure URLs for files without requiring API key authentication. Share links support expiration, optional password protection, and access tracking.

## Endpoints

### Create Share Link

```
POST /files/:id/share
X-API-Key: required
Content-Type: application/json
```

**Body (all optional):**
```json
{
  "ttl": 86400,
  "password": "secret123"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ttl` | number | Time-to-live in seconds (default: 604800 / 7 days) |
| `password` | string | Password protection, minimum 4 characters |

**TTL presets:** 1h = `3600`, 1d = `86400`, 7d = `604800`, 30d = `2592000`

**Response:**
```json
{
  "shareUrl": "https://your-domain.com/share/share_a7f3b9e1...",
  "token": "share_a7f3b9e1...",
  "expiresAt": "2025-11-02T12:00:00.000Z",
  "hasPassword": true,
  "ttl": 86400
}
```

### Access Shared File (Public)

```
GET /share/:token
GET /share/:token?password=secret123
```

No API key required. Returns file info and a presigned download URL.

**Response:**
```json
{
  "file": {
    "id": 1,
    "name": "document.pdf",
    "customName": "Important Document",
    "mime": "application/pdf",
    "size": 1024000,
    "createdAt": "2025-10-26T00:00:00.000Z"
  },
  "downloadUrl": "https://s3.backblaze.com/...",
  "expiresAt": "2025-11-02T12:00:00.000Z",
  "accessCount": 5
}
```

**Error responses:**

| Status | Error | Cause |
|--------|-------|-------|
| `401` | `Password required` | Password-protected link, no password provided (includes `requiresPassword: true`) |
| `401` | `Invalid password` | Wrong password |
| `403` | `Share link has been revoked` | Link was deactivated |
| `410` | `Share link has expired` | Link TTL expired |

### List Share Links for a File

```
GET /files/:id/shares
X-API-Key: required
```

Returns all active, non-expired share links for a file.

**Response:**
```json
{
  "shares": [
    {
      "token": "share_abc123...",
      "shareUrl": "https://your-domain.com/share/share_abc123...",
      "expiresAt": "2025-11-02T12:00:00.000Z",
      "hasPassword": true,
      "accessCount": 12,
      "createdAt": "2025-10-26T12:00:00.000Z"
    }
  ]
}
```

### Revoke Share Link

```
DELETE /share/:token
X-API-Key: required
```

Soft-deletes the link (marks as inactive). The token becomes inaccessible.

**Response:**
```json
{
  "message": "Share link revoked successfully"
}
```

### Share Links in File Responses

`GET /files` and `GET /files/:id` automatically include active share links for each file:

```json
{
  "shareLinks": [
    {
      "token": "share_abc123...",
      "shareUrl": "https://your-domain.com/share/share_abc123...",
      "expiresAt": "2025-11-02T12:00:00.000Z",
      "hasPassword": false,
      "accessCount": 3
    }
  ]
}
```

## Security

- **Token format:** `share_` + 64 hex characters (32 bytes from `crypto.randomBytes`)
- **Passwords:** Hashed with bcrypt (salt rounds = 10), validated server-side only
- **Expiration:** Always validated server-side against current time
- **Ownership:** Only the file owner (by API key) can create, list, or revoke share links
- **Cascade delete:** Deleting a file removes all its share links automatically

## Database Schema

**Table: `share_links`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key |
| `token` | TEXT | Unique share token |
| `fileId` | INTEGER | Foreign key to files table |
| `expiresAt` | DATETIME | Expiration timestamp |
| `password` | TEXT | Bcrypt hash (null if unprotected) |
| `accessCount` | INTEGER | Number of times accessed |
| `isActive` | BOOLEAN | Whether link is active |
| `createdAt` | DATETIME | Creation timestamp |
