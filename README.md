# API Storage - File Storage with Backblaze B2

A minimal Express API for uploading, listing, and deleting files using Backblaze B2 (S3-compatible storage) with local SQLite metadata storage. Supports multi-tenant file isolation, folder paths, file sharing links, and advanced search with pagination.

## Tech Stack

- **Express** - REST API framework
- **@aws-sdk/client-s3** - S3-compatible client for Backblaze B2
- **TypeORM + SQLite3** - Database ORM and storage
- **Multer** - Multipart file upload handling
- **Zod** - Schema validation
- **Pino** - JSON logging
- **bcrypt** - Password hashing for share links
- **TypeScript** - Type-safe development

## Project Structure

```
api-storage/
├── src/
│   ├── entities/
│   │   ├── FileEntity.ts         # TypeORM entity for file metadata
│   │   └── ShareLinkEntity.ts    # TypeORM entity for share links
│   ├── routes/
│   │   ├── files.route.ts        # Upload/list/get/delete + share creation
│   │   └── share.route.ts        # Public share access + revocation
│   ├── services/
│   │   └── storage.service.ts    # S3/B2 operations wrapper
│   ├── middleware/
│   │   └── auth.middleware.ts     # API key authentication
│   ├── utils/
│   │   ├── validate.ts           # Zod schemas + path normalization
│   │   ├── generate-key.ts       # API key & share token generation
│   │   └── logger.ts             # Pino logger configuration
│   ├── data/
│   │   └── database.sqlite       # SQLite database (auto-created)
│   ├── app.ts                    # Express setup & middleware
│   ├── data-source.ts            # TypeORM data source config
│   └── server.ts                 # Entry point
├── docs/
│   ├── API-KEYS.md               # API key management documentation
│   ├── SHARE-LINKS.md            # Share links documentation
│   └── SEARCH-FILTERS.md         # Search, filters & pagination docs
├── .env                          # Environment variables
├── .env.example                  # Environment template
├── package.json
└── tsconfig.json
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
PORT=4000
B2_REGION=us-west-002
B2_ENDPOINT=https://s3.us-west-002.backblazeb2.com
B2_KEY_ID=your_actual_key_id
B2_APP_KEY=your_actual_app_key
B2_BUCKET=your_bucket_name
BASE_URL=https://your-domain.com   # Optional: used for share link URLs
```

### 3. Run the Server

**Development mode:**
```bash
npm run dev
```

**Production build:**
```bash
npm run build
npm start
```

## Authentication

All file management endpoints require API key authentication via the `X-API-Key` header. Each API key identifies a user/tenant and isolates their files.

```bash
# Create an API key
npm run key:add -- --name "my-app"

# Use in requests
curl http://localhost:4000/files \
  -H "X-API-Key: sk_your_generated_key_here"
```

**For detailed API key management**, see [docs/API-KEYS.md](./docs/API-KEYS.md).

## File Isolation & Storage Structure

Files are isolated per API key (user/tenant). The storage key in B2 follows this structure:

```
{apiKeyId}/{path}/{timestamp}-{filename}
```

- Each API key can only access its own files
- Attempting to access another user's file returns `403 Forbidden`
- The `path` field is optional and allows organizing files in virtual folders

## API Endpoints

### Health Check
```
GET /health
```

### Upload File
```
POST /files/upload
Content-Type: multipart/form-data
X-API-Key: required
```

**Fields:**
- `file` (required) - The file to upload
- `customName` (optional) - Custom display name
- `path` (optional) - Virtual folder path (e.g. `images/avatars`)
- `metadata` (optional) - JSON metadata string

**Path rules:**
- Allowed characters: letters, numbers, `/`, `_`, `-`
- Cannot contain `..` or consecutive slashes `//`
- Leading/trailing slashes are stripped automatically

**Example:**
```bash
curl -X POST http://localhost:4000/files/upload \
  -H "X-API-Key: your_api_key_here" \
  -F "file=@/path/to/photo.jpg" \
  -F "customName=Profile Photo" \
  -F "path=images/avatars" \
  -F 'metadata={"author": "John"}'
```

**Response:**
```json
{
  "id": 1,
  "name": "photo.jpg",
  "customName": "Profile Photo",
  "key": "1/images/avatars/1729776000000-photo.jpg",
  "path": "images/avatars",
  "fullPath": "images/avatars/photo.jpg",
  "mime": "image/jpeg",
  "size": 125648,
  "metadata": {"author": "John"},
  "createdAt": "2025-10-24T12:00:00.000Z",
  "updatedAt": "2025-10-24T12:00:00.000Z"
}
```

### List Files
```
GET /files
X-API-Key: required
```

Returns only files belonging to the authenticated user. Supports search, filters, and pagination.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | string | Search by filename (case-insensitive) |
| `searchPath` | string | Search by path (case-insensitive) |
| `mime` | string | Filter by exact MIME type |
| `minSize` | number | Minimum file size in bytes |
| `maxSize` | number | Maximum file size in bytes |
| `dateFrom` | ISO 8601 | Filter by creation date (from) |
| `dateTo` | ISO 8601 | Filter by creation date (to) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 50) |

**Example:**
```bash
curl "http://localhost:4000/files?search=photo&mime=image/jpeg&page=1&limit=20" \
  -H "X-API-Key: your_api_key_here"
```

**Response:**
```json
{
  "files": [
    {
      "id": 1,
      "name": "photo.jpg",
      "customName": "Profile Photo",
      "key": "1/images/avatars/1729776000000-photo.jpg",
      "path": "images/avatars",
      "fullPath": "images/avatars/photo.jpg",
      "mime": "image/jpeg",
      "size": 125648,
      "metadata": {"author": "John"},
      "createdAt": "2025-10-24T12:00:00.000Z",
      "updatedAt": "2025-10-24T12:00:00.000Z",
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

### Get File Details
```
GET /files/:id
X-API-Key: required
```

Returns file metadata, a presigned download URL (valid for 1 hour), and active share links.

**Response:**
```json
{
  "id": 1,
  "name": "photo.jpg",
  "customName": "Profile Photo",
  "key": "1/images/avatars/1729776000000-photo.jpg",
  "path": "images/avatars",
  "fullPath": "images/avatars/photo.jpg",
  "mime": "image/jpeg",
  "size": 125648,
  "metadata": {"author": "John"},
  "createdAt": "2025-10-24T12:00:00.000Z",
  "updatedAt": "2025-10-24T12:00:00.000Z",
  "downloadUrl": "https://s3.backblaze.com/...?X-Amz-Algorithm=...",
  "shareLinks": []
}
```

### Delete File
```
DELETE /files/:id
X-API-Key: required
```

Deletes the file from B2 storage and removes the database record. Only the file owner can delete it.

### Share Links

Create and manage public share links for files. See [docs/SHARE-LINKS.md](./docs/SHARE-LINKS.md) for full documentation.

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /files/:id/share` | API Key | Create share link |
| `GET /files/:id/shares` | API Key | List share links for a file |
| `GET /share/:token` | Public | Access shared file |
| `DELETE /share/:token` | API Key | Revoke share link |

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `B2_REGION` | Backblaze region | `us-west-002` |
| `B2_ENDPOINT` | S3-compatible endpoint | `https://s3.us-west-002.backblazeb2.com` |
| `B2_KEY_ID` | Application key ID | Your key ID |
| `B2_APP_KEY` | Application key secret | Your app key |
| `B2_BUCKET` | Bucket name | Your bucket name |
| `BASE_URL` | Base URL for share links (optional) | `https://your-domain.com` |

## Testing

```bash
# Run tests
npm test
```

## Deployment

1. Clone repository on server
2. Install dependencies: `npm install`
3. Configure `.env` with production credentials
4. Build: `npm run build`
5. Run: `npm start` or use a process manager like PM2

```bash
npm install -g pm2
pm2 start dist/server.js --name api-storage
pm2 save
pm2 startup
```

## License

ISC
