# API Key Authentication

## Overview

All file management endpoints require API key authentication via the `X-API-Key` header. Each API key identifies a user/tenant and determines file ownership and access control.

- **Authentication method:** `X-API-Key` header
- **Key format:** `sk_` followed by 64 random hexadecimal characters
- **Storage:** SQLite database
- **Management:** CLI scripts via npm commands

## CLI Commands

### Create API Key

```bash
npm run key:add -- --name "consumer-name"
```

The key is displayed only once upon creation. Store it securely.

### List API Keys

```bash
npm run key:list
```

Only the last 8 characters of each key are shown for security.

### Disable / Enable / Delete

```bash
npm run key:disable -- --id <key-id>   # Temporarily disable
npm run key:enable -- --id <key-id>    # Re-enable
npm run key:delete -- --id <key-id>    # Permanently delete
npm run key:help                       # Show help
```

## Usage

Include the key in every request:

```bash
curl http://localhost:4000/files \
  -H "X-API-Key: sk_your_generated_key_here"
```

## Error Responses

| Status | Error | Cause |
|--------|-------|-------|
| `401` | `API key required. Provide X-API-Key header.` | Missing header |
| `401` | `Invalid or inactive API key` | Wrong or disabled key |
| `403` | `Access denied. This file belongs to another user.` | File ownership mismatch |

## Protected Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /files/upload` | Upload file |
| `GET /files` | List files |
| `GET /files/:id` | Get file details |
| `DELETE /files/:id` | Delete file |
| `POST /files/:id/share` | Create share link |
| `GET /files/:id/shares` | List share links |
| `DELETE /share/:token` | Revoke share link |

**Public endpoints (no authentication):**
| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /share/:token` | Access shared file |

## Database Schema

**Table: `api_keys`**

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER | Primary key (used as user/tenant ID for file isolation) |
| `key` | TEXT | The API key (unique, indexed) |
| `name` | TEXT | Consumer name for identification |
| `isActive` | BOOLEAN | Whether the key is currently active |
| `createdAt` | DATETIME | Creation timestamp |
| `updatedAt` | DATETIME | Last modification timestamp |

## Security Recommendations

- Never commit API keys to version control
- Use environment variables in all deployments
- Create separate keys per consumer/environment
- Rotate keys periodically
- Disable keys before deleting to verify no active consumers depend on them
