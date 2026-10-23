# Project Review API

Express 5 + Prisma + PostgreSQL REST API for a **project submission and review dashboard**.
Students submit their projects (repo + live link), and mentors/admins review them: approve, or reject with feedback.

## Features

- JWT authentication (Bearer header **or** httpOnly `accessToken` cookie)
- Role-based access control: `STUDENT`, `MENTOR`, `ADMIN`
- Zod request validation with clear field-level errors
- Duplicate-repo protection (repo URLs are normalized + unique index)
- Atomic review transition (`PENDING` → `APPROVED`/`REJECTED`, no double review)
- Server-side search, status filter and pagination
- Rate limiting on login/signup and on submissions, `helmet`, CORS, 50kb body limit
- Admin account seeded automatically from env vars

## Tech stack

Node.js (>= 20), TypeScript, Express 5, Prisma (PostgreSQL), Zod, bcryptjs, jsonwebtoken, Vitest + Supertest.

## Project structure

```
prisma/                 Prisma schema (split per model), migrations, seed script
src/
  app.ts                Express app, middleware and route mounting
  server.ts             Entry point (seeds admin, connects DB, graceful shutdown)
  config/               Env loading and validation
  lib/prisma.ts         Prisma client
  utils/                AppError, catchAsync, jwt, seedAdmin
  app/
    middlewares/        authenticate / authorize, validateRequest, globalErrorHandler
    modules/
      auth/             routes, controller, service, validation
      submission/       routes, controller, service, validation (+ unit tests)
tests/api.test.ts       API tests
```

## Getting started

### 1. Install

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill it in (the example has every line commented out, so uncomment what you need):

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | – | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/review_db` |
| `JWT_SECRET` | yes | – | Secret for signing tokens (min 32 chars in production) |
| `JWT_EXPIRES_IN` | no | `1d` | Token lifetime |
| `PORT` | no | `5000` | Server port |
| `NODE_ENV` | no | `development` | `production` enables secure cookies |
| `FRONTEND_URL` | no | `http://localhost:3000` | Allowed CORS origin |
| `BCRYPT_SALT_ROUNDS` | no | `10` | Password hashing cost |
| `TRUST_PROXY` | no | `0` | Number of reverse proxies in front of the API |
| `ADMIN_NAME` | no | – | Seeded admin name |
| `ADMIN_EMAIL` | no | – | Seeded admin email |
| `ADMIN_PASSWORD` | no | – | Seeded admin password |

Example `.env`:

```env
NODE_ENV=development
PORT=5000
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/review_db
JWT_SECRET=change-this-to-a-long-random-string-at-least-32-chars
JWT_EXPIRES_IN=1d
ADMIN_NAME=Admin Mentor
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=ChangeMe@12345
```

### 3. Set up the database

```bash
npm run db:migrate     # create tables (development)
npm run seed           # optional: create the admin account
```

For production use `npm run db:deploy` instead of `db:migrate`.

### 4. Run

```bash
npm run dev            # watch mode on http://localhost:5000
# or
npm run build && npm start
```

The server also seeds the admin account on every start (it is skipped if the admin already exists).

### Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start with hot reload (tsx) |
| `npm run build` | `prisma generate` + bundle with tsup |
| `npm start` | Run the built server (`dist/server.js`) |
| `npm run typecheck` | TypeScript check |
| `npm test` / `npm run test:watch` | Run Vitest |
| `npm run seed` | Seed the admin account |
| `npm run db:migrate` / `db:deploy` | Run Prisma migrations |

## Roles

| Role | How you get it | Can do |
| --- | --- | --- |
| `STUDENT` | Public `POST /auth/signup` | Submit projects, view own submissions |
| `ADMIN` | Seeded from `ADMIN_*` env vars | List/search all submissions, view stats, review |
| `MENTOR` | Not creatable through the API (insert/update a user's `role` in the DB) | Same as `ADMIN` for submissions |

## API reference

Base URL: `http://localhost:5000` · API prefix: `/api/v1`

All bodies are JSON (`Content-Type: application/json`). Protected endpoints need
`Authorization: Bearer <accessToken>` (the token is returned by signup/login; the same token is also set as an httpOnly cookie).

### Response format

```jsonc
// success
{ "success": true, "message": "...", "data": { } }

// error
{ "success": false, "message": "..." }

// validation error (400)
{
  "success": false,
  "message": "Validation failed",
  "errors": [{ "path": "password", "message": "Password must contain a number" }]
}
```

### Endpoint summary

| Method | Path | Auth | Role | Description |
| --- | --- | --- | --- | --- |
| GET | `/` | – | – | Server status |
| GET | `/health` | – | – | Liveness + DB check |
| POST | `/api/v1/auth/signup` | – | – | Create a student account |
| POST | `/api/v1/auth/login` | – | – | Log in |
| POST | `/api/v1/auth/logout` | – | – | Clear the auth cookie |
| GET | `/api/v1/auth/me` | yes | any | Current user |
| POST | `/api/v1/submissions` | yes | STUDENT | Submit a project |
| GET | `/api/v1/submissions/mine` | yes | STUDENT | My submissions |
| GET | `/api/v1/submissions` | yes | MENTOR, ADMIN | List all (filter / search / paginate) |
| GET | `/api/v1/submissions/stats` | yes | MENTOR, ADMIN | Counts by status |
| PATCH | `/api/v1/submissions/:id/review` | yes | MENTOR, ADMIN | Approve or reject |

---

### Health

**GET `/`**

```json
{ "success": true, "message": "Server is running" }
```

**GET `/health`** → `200 { "success": true, "status": "ok" }` or `503` if the database is unreachable.

---

### Auth

#### POST `/api/v1/auth/signup`

Creates a `STUDENT` account and returns a session. Rate limited: 20 requests / 15 min.

Body:

```json
{
  "name": "Jane Student",
  "email": "jane@example.com",
  "password": "Passw0rd123"
}
```

Rules: `name` 2–60 chars · valid `email` (lower-cased) · `password` 8–72 chars with at least one letter and one number.

Response `201`:

```json
{
  "success": true,
  "message": "Account created",
  "data": {
    "user": { "id": "clx...", "name": "Jane Student", "email": "jane@example.com", "role": "STUDENT" },
    "accessToken": "eyJhbGciOi..."
  }
}
```

Errors: `400` validation · `409` email already exists · `429` too many attempts.

#### POST `/api/v1/auth/login`

Body:

```json
{
  "email": "jane@example.com",
  "password": "Passw0rd123"
}
```

Response `200`: same shape as signup, message `Logged in successfully`.
Errors: `400` validation · `401` `Invalid email or password` · `429`.

#### POST `/api/v1/auth/logout`

No body. Clears the `accessToken` cookie. Response `200`: `{ "success": true, "message": "Logged out" }`.

#### GET `/api/v1/auth/me`

Requires a token. Response `200`:

```json
{ "success": true, "data": { "user": { "id": "clx...", "name": "Jane Student", "email": "jane@example.com", "role": "STUDENT" } } }
```

Errors: `401` missing/invalid/expired token.

---

### Submissions

A submission looks like this in responses:

```json
{
  "id": "clx...",
  "projectName": "My Portfolio",
  "repoUrl": "https://github.com/owner/repo",
  "liveLink": "https://example.dev",
  "description": "A portfolio site built with Next.js and Tailwind.",
  "status": "PENDING",
  "createdAt": "2026-10-23T05:40:00.000Z",
  "reviewedAt": null,
  "studentId": "clx...",
  "student": { "id": "clx...", "name": "Jane Student", "email": "jane@example.com" },
  "feedbacks": [ { "message": "Add a README", "createdAt": "2026-10-23T06:00:00.000Z" } ]
}
```

`feedbacks` contains only the latest feedback (at most one item).

#### POST `/api/v1/submissions` (STUDENT)

Rate limited: 5 submissions / 10 min per user.

Body:

```json
{
  "projectName": "My Portfolio",
  "repoUrl": "https://github.com/owner/repo",
  "liveLink": "https://example.dev",
  "description": "A portfolio site built with Next.js and Tailwind."
}
```

Rules:

- `projectName`: 3–100 chars
- `repoUrl`: `http(s)` URL to a repo on `github.com`, `gitlab.com` or `bitbucket.org` with `owner/repo` path. It is normalized (lower-case, no `www.`, no `.git`, no trailing slash, no query/hash), so `https://GitHub.com/Owner/Repo.git` and `https://github.com/owner/repo` are the same repo.
- `liveLink`: valid `http(s)` URL
- `description`: 20–1000 chars

Response `201`: `{ "success": true, "message": "Project submitted for review", "data": { ...submission } }`
Errors: `400` validation · `401` · `403` not a student · `409` `This repository has already been submitted` · `429`.

#### GET `/api/v1/submissions/mine` (STUDENT)

Returns the logged-in student's submissions, newest first.

```json
{ "success": true, "data": [ { ...submission } ] }
```

#### GET `/api/v1/submissions` (MENTOR, ADMIN)

Query parameters (all optional):

| Param | Default | Description |
| --- | --- | --- |
| `page` | `1` | Page number (>= 1) |
| `limit` | `10` | Page size (1–50) |
| `status` | – | `PENDING`, `APPROVED` or `REJECTED` |
| `search` | – | Case-insensitive match on project name, student name or student email |

Example: `GET /api/v1/submissions?status=PENDING&search=jane&page=1&limit=10`

Response `200`:

```json
{
  "success": true,
  "data": [ { ...submission } ],
  "meta": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

#### GET `/api/v1/submissions/stats` (MENTOR, ADMIN)

```json
{ "success": true, "data": { "total": 12, "pending": 5, "approved": 4, "rejected": 3 } }
```

#### PATCH `/api/v1/submissions/:id/review` (MENTOR, ADMIN)

Approve:

```json
{ "status": "APPROVED" }
```

Reject (feedback is **required** when rejecting):

```json
{ "status": "REJECTED", "feedback": "Please add a README and deploy the live link." }
```

Rules: `status` must be `APPROVED` or `REJECTED` (not `PENDING`) · `feedback` max 1000 chars (optional when approving).

Response `200`: `{ "success": true, "message": "Project approved", "data": { ...submission } }` (message is `Project rejected` for rejections).
Errors: `400` validation · `403` · `404` `Submission not found` · `409` `This submission has already been reviewed`.

---

### Common errors

| Status | Meaning |
| --- | --- |
| 400 | Validation failed / malformed JSON |
| 401 | Missing, invalid or expired token |
| 403 | Role not allowed for this endpoint |
| 404 | Unknown route or submission |
| 409 | Duplicate email / repo, or submission already reviewed |
| 429 | Rate limit hit |
| 500 | Internal server error |

## How to test the APIs

Start the server first (`npm run dev`). Examples below use `http://localhost:5000`.

### Typical flow

1. Sign up a student → copy `accessToken`
2. Submit a project as the student
3. Log in as the admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`) → copy its `accessToken`
4. List / review the submission as the admin

### Option A: curl

**Bash / macOS / Linux / Git Bash**

```bash
# 1. Sign up a student
curl -X POST http://localhost:5000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Student","email":"jane@example.com","password":"Passw0rd123"}'

# 2. Log in (save the token)
STUDENT_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"Passw0rd123"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.accessToken")

# 3. Who am I?
curl http://localhost:5000/api/v1/auth/me -H "Authorization: Bearer $STUDENT_TOKEN"

# 4. Submit a project
curl -X POST http://localhost:5000/api/v1/submissions \
  -H "Authorization: Bearer $STUDENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"projectName":"My Portfolio","repoUrl":"https://github.com/owner/repo","liveLink":"https://example.dev","description":"A portfolio site built with Next.js and Tailwind."}'

# 5. My submissions
curl http://localhost:5000/api/v1/submissions/mine -H "Authorization: Bearer $STUDENT_TOKEN"

# 6. Log in as admin
ADMIN_TOKEN=$(curl -s -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"ChangeMe@12345"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.accessToken")

# 7. List pending submissions, stats
curl "http://localhost:5000/api/v1/submissions?status=PENDING&page=1&limit=10" -H "Authorization: Bearer $ADMIN_TOKEN"
curl http://localhost:5000/api/v1/submissions/stats -H "Authorization: Bearer $ADMIN_TOKEN"

# 8. Review (replace SUBMISSION_ID with an id from step 7)
curl -X PATCH http://localhost:5000/api/v1/submissions/SUBMISSION_ID/review \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status":"REJECTED","feedback":"Please add a README and deploy the live link."}'
```

**Windows PowerShell**

`curl` is an alias for `Invoke-WebRequest` in Windows PowerShell, so use `Invoke-RestMethod`:

```powershell
$base = "http://localhost:5000/api/v1"

# Sign up / log in
$session = Invoke-RestMethod -Method Post -Uri "$base/auth/login" -ContentType "application/json" `
  -Body '{"email":"jane@example.com","password":"Passw0rd123"}'
$headers = @{ Authorization = "Bearer $($session.data.accessToken)" }

# Submit a project
Invoke-RestMethod -Method Post -Uri "$base/submissions" -Headers $headers -ContentType "application/json" `
  -Body '{"projectName":"My Portfolio","repoUrl":"https://github.com/owner/repo","liveLink":"https://example.dev","description":"A portfolio site built with Next.js and Tailwind."}'

# My submissions
Invoke-RestMethod -Uri "$base/submissions/mine" -Headers $headers
```

### Option B: Postman

1. Create an environment with `baseUrl = http://localhost:5000/api/v1` and an empty `token`.
2. **POST** `{{baseUrl}}/auth/login`, Body → raw → JSON, then in the **Tests** tab save the token:
   ```js
   pm.environment.set("token", pm.response.json().data.accessToken);
   ```
3. For protected requests set Authorization → Bearer Token → `{{token}}`.
4. Use the JSON bodies from the [API reference](#api-reference). Log in as the student to test student endpoints and as the admin to test review endpoints (re-run the login request to swap the token).

Postman CLI can run an exported collection: `postman collection run <collection.json> -e <environment.json>`.

### Option C: VS Code REST Client / Thunder Client

Any HTTP client works: set the `Content-Type: application/json` header, paste a body from this README, and add `Authorization: Bearer <token>` for protected routes.

### Quick negative checks

| Try | Expect |
| --- | --- |
| Signup with `"password":"short"` | `400` Validation failed |
| Signup twice with the same email | `409` |
| Login with a wrong password | `401` |
| `GET /submissions/mine` without a token | `401` |
| `POST /submissions` using the admin token | `403` |
| Submit the same `repoUrl` twice (even as `...Repo.git`) | `409` |
| `repoUrl` = `https://example.com/a/b` | `400` |
| Review with `{"status":"REJECTED"}` (no feedback) | `400` |
| Review the same submission twice | `409` |
| Review a non-existent id | `404` |

### Automated tests

```bash
npm test
```

Runs the Vitest suites (`tests/api.test.ts` and the validation unit tests in `src/app/modules/submission/`). The API tests need the same `.env` / database configuration as the app.

## Data model

```
User ──< Submission ──< Feedback >── User (mentor)

User:       id, name, email (unique), passwordHash, role, createdAt
Submission: id, projectName, repoUrl (unique), liveLink, description,
            status (PENDING | APPROVED | REJECTED), createdAt, reviewedAt, studentId
Feedback:   id, message, createdAt, submissionId, mentorId
```

## License

ISC
