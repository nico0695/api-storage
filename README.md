# API Storage - File Storage with Backblaze B2

A minimal Express API for uploading, listing, and deleting files using Backblaze B2 (S3-compatible storage) with local SQLite metadata storage.

## 📋 Project Summary

This is a lightweight file storage API that:
- Uploads files to **Backblaze B2** cloud storage
- Stores file metadata (name, size, MIME type, etc.) in a local **SQLite** database
- Provides REST endpoints for file management
- Uses **TypeScript** for type safety
- Implements input validation with **Zod**
- Includes structured logging with **Pino**

## 🛠 Tech Stack

- **Express** - REST API framework
- **@aws-sdk/client-s3** - S3-compatible client for Backblaze B2
- **TypeORM + SQLite3** - Database ORM and storage
- **Multer** - Multipart file upload handling
- **Zod** - Schema validation
- **Pino** - JSON logging
- **TypeScript** - Type-safe development

## 📁 Project Structure

```
api-storage/
├── src/
│   ├── entities/
│   │   └── FileEntity.ts         # TypeORM entity for file metadata
│   ├── routes/
│   │   └── files.route.ts        # Upload/list/delete endpoints
│   ├── services/
│   │   └── storage.service.ts    # S3/B2 operations wrapper
│   ├── utils/
│   │   └── validate.ts           # Zod validation schemas
│   ├── data/
│   │   └── database.sqlite       # SQLite database (auto-created)
│   ├── app.ts                    # Express setup & middleware
│   └── server.ts                 # Entry point
├── .env                          # Environment variables (create from .env.example)
├── .env.example                  # Environment template
├── package.json
└── tsconfig.json
```

## 🚀 Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and fill in your Backblaze B2 credentials:

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
```

**How to get B2 credentials:**
1. Sign up at [Backblaze B2](https://www.backblaze.com/b2/cloud-storage.html)
2. Create a bucket
3. Generate application keys with read/write permissions
4. Note your endpoint region

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

The server will start on `http://localhost:4000`

## 🔌 API Endpoints

### 1. Health Check
```
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-24T12:00:00.000Z"
}
```

### 2. Upload File
```
POST /files/upload
Content-Type: multipart/form-data
```

**Request:**
- Send file as `multipart/form-data` with field name `file`

**Example using curl:**
```bash
curl -X POST http://localhost:4000/files/upload \
  -F "file=@/path/to/your/file.jpg"
```

**Example using Postman:**
- Method: POST
- URL: `http://localhost:4000/files/upload`
- Body: form-data
- Key: `file` (type: File)
- Value: Select your file

**Response:**
```json
{
  "id": 1,
  "name": "example.jpg",
  "key": "1729776000000-example.jpg",
  "mime": "image/jpeg",
  "size": 125648,
  "createdAt": "2025-10-24T12:00:00.000Z"
}
```

### 3. List Files
```
GET /files
```

**Response:**
```json
{
  "files": [
    {
      "id": 1,
      "name": "example.jpg",
      "key": "1729776000000-example.jpg",
      "mime": "image/jpeg",
      "size": 125648,
      "createdAt": "2025-10-24T12:00:00.000Z"
    }
  ]
}
```

### 4. Delete File
```
DELETE /files/:id
```

**Example:**
```bash
curl -X DELETE http://localhost:4000/files/1
```

**Response:**
```json
{
  "message": "File deleted successfully"
}
```

## 📝 How It Works

1. **Upload Flow:**
   - Client sends file via multipart form-data
   - Multer processes the upload and stores in memory
   - Zod validates file metadata
   - File is uploaded to Backblaze B2 with unique key
   - Metadata is saved to SQLite database
   - Response includes file details

2. **List Flow:**
   - Retrieves all file metadata from SQLite
   - Returns array of files sorted by creation date

3. **Delete Flow:**
   - Validates file ID
   - Finds file record in database
   - Deletes file from B2 using stored key
   - Removes database record

## 🔒 Features

- **Input Validation:** Zod schemas validate all inputs
- **Error Handling:** Comprehensive error handling with proper HTTP status codes
- **Logging:** Structured JSON logs via Pino for debugging
- **Type Safety:** Full TypeScript coverage
- **Unique Keys:** Files stored with timestamp-prefixed keys to avoid collisions
- **Database Auto-sync:** TypeORM automatically creates tables on startup

## 🧪 Testing the API

**Upload a file:**
```bash
curl -X POST http://localhost:4000/files/upload \
  -F "file=@./test-image.jpg"
```

**List all files:**
```bash
curl http://localhost:4000/files
```

**Delete a file (replace 1 with actual ID):**
```bash
curl -X DELETE http://localhost:4000/files/1
```

## 🚢 Deployment

This API is designed to run on a small VPS or cloud instance:

1. Clone repository on server
2. Install dependencies: `npm install`
3. Configure `.env` with production credentials
4. Build: `npm run build`
5. Run: `npm start` or use a process manager like PM2

**Using PM2:**
```bash
npm install -g pm2
pm2 start dist/server.js --name api-storage
pm2 save
pm2 startup
```

## 📦 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port | `4000` |
| `B2_REGION` | Backblaze region | `us-west-002` |
| `B2_ENDPOINT` | S3-compatible endpoint | `https://s3.us-west-002.backblazeb2.com` |
| `B2_KEY_ID` | Application key ID | Your key ID |
| `B2_APP_KEY` | Application key secret | Your app key |
| `B2_BUCKET` | Bucket name | Your bucket name |

## 🐛 Troubleshooting

**Database errors:**
- Ensure `src/data/` directory has write permissions
- Check SQLite is properly installed

**B2 connection errors:**
- Verify credentials in `.env`
- Check endpoint URL matches your bucket region
- Ensure bucket has correct permissions

**Upload failures:**
- Check file size limits (default 50MB in Express config)
- Verify MIME type is supported
- Check B2 bucket has sufficient storage

## 📄 License

ISC
