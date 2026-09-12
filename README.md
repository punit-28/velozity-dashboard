# Velozity Client Project Dashboard

A full-stack, real-time client project dashboard built for the Velozity Global
Solutions technical assessment: role-based access control enforced at the API
layer, a live WebSocket activity feed with role-filtered visibility and
missed-event catch-up, a scheduled overdue-task sweep, and real-time
notifications.

- **Frontend:** React 18 + TypeScript (Vite)
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL via Prisma ORM
- **Real-time:** Socket.io (WebSocket)
- **Background jobs:** node-cron
- **Auth:** JWT access token (in-memory on the client) + HttpOnly-cookie
  refresh token, with rotation and server-side revocation

---

## 1. Local Setup

### Option A — Docker (preferred)

```bash
cp backend/.env.example backend/.env
docker compose up --build
```

This starts Postgres, runs the backend (migrations + seed happen on first
`npm run prisma:migrate:dev` — see below — the container itself just runs
`prisma migrate deploy` against whatever migrations exist), and the frontend
dev server.

- API: http://localhost:4000
- App: http://localhost:5173

The very first time, run migrations + seed from your host once the `db`
container is healthy:

```bash
cd backend
npm install
npx prisma migrate dev --name init
npm run seed
```

(`migrate dev` is what actually creates the migration files under
`prisma/migrations/`; the Docker image's `migrate deploy` step just applies
whatever migrations already exist in the repo, which is the standard
dev-creates/prod-applies split for Prisma.)

### Option B — Manual (no Docker)

Requires a local PostgreSQL instance.

```bash
# Backend
cd backend
cp .env.example .env        # edit DATABASE_URL if needed
npm install
npx prisma migrate dev --name init
npm run seed
npm run dev                 # http://localhost:4000

# Frontend (separate terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

### Seeded accounts

All seeded users share the password `Password123!`.

| Role | Email |
|---|---|
| Admin | admin@velozity.dev |
| PM | pm1@velozity.dev / pm2@velozity.dev |
| Developer | dev1@velozity.dev … dev4@velozity.dev |

The seed script creates 3 projects, 15 tasks spread across all four statuses
(including two already overdue), pre-existing activity log entries, and
pre-existing notifications, so the app is never empty on first load.

---

## 2. Database Schema

```
User (id, name, email, passwordHash, role[ADMIN|PM|DEVELOPER])
  ├─< RefreshToken (hashed token, expiresAt, revokedAt)        — refresh rotation/revocation
  ├─< Project (as manager)                                      — PM ownership
  ├─< Task (as assignee)
  ├─< TaskStatusEvent (as changedBy)                             — durable audit log
  ├─< ActivityEvent (as actor)                                   — feed source of truth
  └─< Notification (as recipient)

Client (id, name, email)
  └─< Project

Project (id, name, description, clientId → Client, managerId → User)
  ├─< Task
  └─< ActivityEvent

Task (id, title, description, projectId → Project, assigneeId → User,
      status[TODO|IN_PROGRESS|IN_REVIEW|DONE],
      priority[LOW|MEDIUM|HIGH|CRITICAL], dueDate, isOverdue)
  ├─< TaskStatusEvent
  ├─< ActivityEvent
  └─< Notification

TaskStatusEvent (id, taskId, fromStatus, toStatus, changedById, createdAt)
  — one row per transition; never derived, always written in the same
    transaction as the status update.

ActivityEvent (id, projectId, taskId, actorId, message, metadata json, createdAt)
  — denormalized, human-readable feed row. One row per user-visible event.

Notification (id, userId, taskId, type, message, isRead, createdAt)
```

Full definitions are in `backend/prisma/schema.prisma`.

### Indexing decisions

| Index | Why |
|---|---|
| `Task(projectId)` | Every project page loads its task list. |
| `Task(assigneeId)` | Developer dashboard / "my tasks" is the single most frequent query. |
| `Task(status)`, `Task(priority)`, `Task(dueDate)` | Each is an independent, shareable URL filter (`?status=`, `?priority=`, `?dueDateFrom=&dueDateTo=`); Postgres can use whichever is most selective. |
| `Task(assigneeId, priority, dueDate)` composite | Matches the Developer dashboard's exact sort order (priority desc, then due date asc) so that query can be satisfied by an index scan instead of a full sort. |
| `Project(managerId)` | Every PM-scoped query (`WHERE managerId = ...`) — this is the ownership check run on nearly every PM request. |
| `ActivityEvent(projectId, createdAt)` | Feed reads are always "latest N for this project," so the composite keeps `ORDER BY createdAt DESC LIMIT N` an index-range scan. |
| `ActivityEvent(actorId, createdAt)` | Supports a "my activity" query pattern without scanning the whole table. |
| `Notification(userId, isRead)` | The notification bell's hottest query: unread count / unread list for the current user. |
| `User(role)` | Cheap filter used when listing developers for assignment dropdowns. |

---

## 3. Architectural Decisions

**WebSocket library — Socket.io, not raw `ws`.**
The spec requires per-project rooms, role-scoped broadcast (admin global feed
vs. PM-scoped vs. developer-scoped), and reconnection handling for users who
go offline and come back. Socket.io gives room management, automatic
reconnection/backoff, and a handshake-time auth hook out of the box, which
would otherwise mean hand-rolling a room/broadcast layer on top of raw `ws`.
The trade-off is a slightly heavier client bundle and a proprietary wire
protocol (not plain WebSocket frames) — acceptable here since both ends of
the app are controlled.

**Room join is re-authorized server-side, every time.** A socket doesn't get
to declare "I'm allowed in project X's room" — on `project:join` the server
re-runs the same ownership check used by the REST layer (PM must manage the
project; Developer must have an assigned task in it) before calling
`socket.join()`. This mirrors the REST-level enforcement instead of trusting
the client.

**Background jobs — node-cron, not Bull/BullMQ.**
The overdue-task sweep is a single lightweight recurring job with no
per-task payload, no need for retries/backoff, and no requirement to
distribute work across multiple worker processes. Bull(MQ) earns its keep
when you need a durable job queue with retries, priorities, and multiple
consumers pulling from Redis — none of which this job needs. node-cron runs
in-process on a `*/5 * * * *` schedule, which is simpler to run, simpler to
reason about, and has one less moving part (no Redis dependency) for a
single-instance deployment. The trade-off: if the app scales to multiple
backend instances, node-cron would fire the sweep once per instance and
needs a leader-election guard or a move to a real queue — noted as a known
limitation below.

**Refresh token storage — HttpOnly cookie, not localStorage.**
The refresh token is set as an `HttpOnly`, `SameSite=Lax`, path-scoped
(`/api/auth`) cookie, so it is never readable by JavaScript running on the
page — this is the standard mitigation against token theft via XSS. The
short-lived access token lives only in memory on the client (a module-level
variable in `frontend/src/api/client.ts`), not in localStorage or a cookie,
so it disappears on tab close and never rides along on unrelated requests.
On refresh, the token is rotated (old one revoked in the `RefreshToken`
table, a new row created) so a captured refresh token can't be replayed
indefinitely once the legitimate client has moved past it.

**ORM — Prisma over raw SQL.**
Chosen for migration management, type-safe query building that matches the
schema exactly, and because the relational structure here (users → projects
→ tasks → status events / activity / notifications, all FK-linked) maps
cleanly onto Prisma's relation API without needing hand-written joins for
the common paths.

---

## 4. Known Limitations

- **Single-instance assumption for cron + Socket.io presence.** The overdue
  sweep and the in-memory "online users" count both assume one backend
  process. Scaling horizontally would need the cron job guarded by a leader
  election (or moved to Postgres `pg_cron`) and presence backed by a shared
  store (Redis) plus the Socket.io Redis adapter for cross-instance room
  broadcast.
- **No project archiving/soft-delete** — projects and tasks are hard rows;
  there's no "archived" state, so the project list will grow unbounded over
  time in a real deployment.
- **No test suite included.** Given the scope of the assessment, effort went
  into the access-control, real-time, and schema correctness rather than
  automated tests; this would be the next addition.
- **Notification delivery is at-least-once, not exactly-once** across a
  reconnect window — a client that reconnects mid-event could in rare cases
  see a duplicate `notification:new` if the unread-count fetch and the live
  push race. The UI de-dupes by id on render but this isn't hardened.
- **File attachments, comments, and email notifications are out of scope**
  for this build — only in-app notifications are implemented, as specified.
- **Rate limiting is not implemented** on the auth endpoints; a production
  deployment would want it on `/api/auth/login` and `/api/auth/refresh`.

---

## 5. Explanation (for the submission form)

> **The hardest problem I solved:** getting the real-time activity feed to be
> both role-filtered *and* consistent after a reconnect. It's easy to just
> broadcast every event to everyone and filter on the client, but that leaks
> data a Developer or PM shouldn't see over the wire. Instead, every event is
> written to the `ActivityEvent` table first, then pushed only to the rooms a
> socket is server-authorized to be in (`project:{id}`, a per-PM room, a
> per-developer personal room, and an admin-global room) — join requests are
> re-checked against the same ownership rules as the REST API, not trusted
> from the client. For the "missed events" case, the feed always loads its
> initial state from a `GET /api/feed` query scoped by role, ordered by
> `createdAt DESC LIMIT 20`, so a user who was offline sees the same accurate
> history regardless of which server process handled their reconnect. One
> thing I'd do differently: I'd introduce a lightweight "read cursor" per
> user (last-seen `ActivityEvent.id`) so catch-up could return only the
> events strictly after where they left off instead of a flat last-20, which
> would handle a user who was offline for longer than 20 events without
> gaps.

*(150–250 words — trim/adjust freely before submitting.)*
