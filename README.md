# Student Hiring Portal

A full-stack MERN application for managing student job applications.

## Tech Stack

- **Frontend**: React (Vite) + Tailwind CSS
- **Backend**: Node.js + Express.js
- **Database**: MongoDB (Atlas)
- **Auth**: JWT (Admin only)
- **File Upload**: Multer (Resume PDF/DOC/DOCX)

---

## Project Structure

```
mandi-portal/
├── backend/
│   ├── models/          # Mongoose schemas (Admin, College, Student)
│   ├── routes/          # API routes
│   ├── middleware/       # JWT auth + Multer upload
│   ├── uploads/         # Uploaded resumes (gitignored)
│   ├── server.js
│   ├── seedAdmin.js     # Auto-creates admin on first run
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── pages/       # ApplicationForm, AdminLogin, AdminDashboard, AdminColleges
    │   ├── components/  # Header, Footer, AdminLayout, ProtectedRoute, Spinner
    │   ├── context/     # AuthContext (JWT)
    │   └── utils/       # API client, location data
    └── .env.example
```

---

## Local Setup

### Prerequisites
- Node.js >= 18
- MongoDB Atlas account (or local MongoDB)

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd mandi-portal
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URI, JWT secret, and admin credentials
npm run dev
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
cp .env.example .env
# Set VITE_API_URL=http://localhost:5000
npm run dev
```

Open http://localhost:5173 for the student form.
Open http://localhost:5173/adm-3e9f7b2c/login for the admin panel (unguessable admin URL).

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for JWT signing |
| `PORT` | Server port (default: 5000) |
| `ADMIN_EMAIL` | Initial admin email |
| `ADMIN_PASSWORD` | Initial admin password |
| `FRONTEND_URL` | CORS allowed origin |

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API base URL |

---

## API Endpoints

### Public
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/colleges` | List all colleges |
| POST | `/api/students` | Submit application (multipart) |

### Admin (JWT required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Admin login |
| GET | `/api/students` | List applications (search, pagination) |
| GET | `/api/students/:id` | Single application |
| PUT | `/api/students/:id` | Edit application |
| DELETE | `/api/students/:id` | Delete application |
| GET | `/api/students/:id/resume` | Download resume |
| POST | `/api/colleges` | Add college |
| PUT | `/api/colleges/:id` | Edit college |
| DELETE | `/api/colleges/:id` | Delete college |

---

## Deployment

### Frontend → Vercel

1. Push `frontend/` folder to GitHub
2. Import in Vercel
3. Set `VITE_API_URL=https://your-render-backend.onrender.com`
4. Deploy

### Backend → Render

1. Push `backend/` folder to GitHub
2. Create a new **Web Service** on Render
3. Build command: `npm install`
4. Start command: `node server.js`
5. Set all environment variables in Render dashboard
6. Deploy

### Database → MongoDB Atlas

1. Create a free cluster at [mongodb.com/atlas](https://mongodb.com/atlas)
2. Create database user and whitelist IP `0.0.0.0/0`
3. Copy connection string to `MONGODB_URI`

---

## Notes

- Admin is seeded automatically on first server start using `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars.
- Uploaded resumes are stored in `backend/uploads/`. On Render, use a persistent disk or migrate to cloud storage (S3/Cloudinary) for production.
- The `uploads/` directory is served as static files at `/uploads/`.
