# Search, Filters & Pagination

## Endpoint

```
GET /files
X-API-Key: required
```

All results are automatically scoped to the authenticated user's files.

## Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `search` | string | No | Search by filename (case-insensitive, partial match) | `logo.png` |
| `searchPath` | string | No | Search by path (case-insensitive, partial match) | `images/avatars` |
| `mime` | string | No | Filter by exact MIME type | `image/png` |
| `minSize` | number | No | Minimum file size in bytes | `1000` |
| `maxSize` | number | No | Maximum file size in bytes | `5000000` |
| `dateFrom` | string (ISO 8601) | No | Creation date from | `2024-01-01T00:00:00Z` |
| `dateTo` | string (ISO 8601) | No | Creation date until | `2024-12-31T23:59:59Z` |
| `page` | number | No | Page number (default: 1) | `2` |
| `limit` | number | No | Results per page (default: 50) | `20` |

## Response Format

```json
{
  "files": [
    {
      "id": 1,
      "name": "profile-photo.jpg",
      "customName": "John's Avatar",
      "key": "1/images/avatars/1704067200000-profile-photo.jpg",
      "path": "images/avatars",
      "fullPath": "images/avatars/profile-photo.jpg",
      "mime": "image/jpeg",
      "size": 245678,
      "metadata": { "userId": "123" },
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "shareLinks": []
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

## Examples

```bash
# Search by filename
GET /files?search=logo

# Search by path
GET /files?searchPath=images/avatars

# Filter by MIME type
GET /files?mime=image/png

# Filter by size range (1KB to 5MB)
GET /files?minSize=1000&maxSize=5000000

# Filter by date range
GET /files?dateFrom=2024-01-01T00:00:00Z&dateTo=2024-01-31T23:59:59Z

# Combined filters with pagination
GET /files?search=document&mime=application/pdf&minSize=50000&page=1&limit=20

# Search by path and name together
GET /files?search=avatar&searchPath=images&page=1&limit=10
```

## Pagination

Uses offset-based pagination with `page` and `limit`.

- Results are ordered by creation date (newest first)
- The `pagination` object in the response contains all the metadata needed to navigate pages
- Filters and pagination can be combined freely
