# CareerOS

> AI-powered career operating system for engineering students.

CareerOS is a full-stack AI platform that helps engineering students with:

- Personalized AI career roadmaps
- Resume analysis
- ATS score improvement
- AI career mentor
- Mock interviews
- Skill tracking
- Career progress dashboard

## Current Status

The backend is scaffolded and operational. The frontend (React + TypeScript + Tailwind CSS) is **not yet built** — this repo currently contains only the Node.js/Express backend.

## Tech Stack

### Frontend (planned)
- React
- TypeScript
- Tailwind CSS

### Backend
- Node.js
- Express.js
- TypeScript
- Prisma ORM (PostgreSQL)

### Database
- PostgreSQL (via Supabase)
- Prisma ORM

### AI
- Google Gemini API

## Backend Architecture

```
backend/
├── src/
│   ├── server.ts           # Entry point: loads dotenv, connects Prisma, starts HTTP server on :3000
│   ├── app.ts              # Express app: JSON middleware, health-check route, mounts routers
│   ├── config/
│   │   └── prisma.ts       # Singleton PrismaClient wired with the PrismaPg adapter (pg driver)
│   ├── controllers/        # HTTP layer — parses request/res, calls services
│   │   ├── goal.controller.ts
│   │   └── user.controller.ts
│   ├── services/           # Business logic layer
│   │   ├── goal.service.ts      # prisma.goal.create(...)
│   │   └── user.service.ts      # user profile/registration logic
│   ├── routes/             # Express routers
│   │   ├── goal.routes.ts       # POST /api/goals
│   │   └── user.routes.ts       # GET /api/users/profile, POST /api/users/register
│   └── generated/prisma/   # Auto-generated Prisma Client
├── prisma/
│   ├── schema.prisma       # Database schema (Goal model)
│   └── migrations/         # SQL migrations
├── .env                    # Environment variables (DATABASE_URL)
├── package.json
└── tsconfig.json
```

### Data Model

```prisma
model Goal {
  id          Int      @id @default(autoincrement())
  title       String
  description String?
  category    String
  status      String   @default("ACTIVE")
  targetDate  DateTime?
  createdAt   DateTime @default(now())
}
```

## API Endpoints

| Method | Path                  | Description              |
|--------|-----------------------|--------------------------|
| GET    | `/`                   | Health check / app info  |
| POST   | `/api/goals`          | Create a new goal        |
| GET    | `/api/users/profile`   | Get user profile         |
| POST   | `/api/users/register`  | Register a new user      |

## Getting Started

### Prerequisites
- Node.js (v18+)
- A PostgreSQL database (e.g., [Supabase](https://supabase.com/))

### Setup

```bash
cd backend
npm install
```

Copy the `.env` file and set your `DATABASE_URL`:

```bash
cp .env .env   # already present — update DATABASE_URL with your own connection string
```

Generate the Prisma client:

```bash
npx prisma generate
```

Run the database migrations:

```bash
npx prisma migrate deploy
```

### Running

```bash
# Development mode (hot reload)
npm run dev

# Production
npm run build
npm start
```

The server will start on `http://localhost:3000`.

## Environment Variables

| Variable       | Description                  |
|----------------|------------------------------|
| `DATABASE_URL` | PostgreSQL connection string |

## Roadmap

- [ ] Build React frontend (TypeScript + Tailwind)
- [ ] User authentication
- [ ] Resume analysis & ATS scoring
- [ ] AI career mentor (Google Gemini API)
- [ ] Mock interview module
- [ ] Skill tracking
- [ ] Career progress dashboard

## License

ISC