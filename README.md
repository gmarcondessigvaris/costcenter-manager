# SIGVARIS Cost Center Manager

Internal budget and invoice management tool, organized by cost centers.

## Stack
- **Backend**: Python 3.11+, FastAPI, SQLAlchemy, PostgreSQL
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS
- **Auth**: Azure AD SSO (MSAL)

---

## Quick Start

### 1. Database
Create a PostgreSQL database:
```sql
CREATE DATABASE costcenter_db;
```

### 2. Backend
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# Edit .env with your DATABASE_URL, AZURE_TENANT_ID, AZURE_CLIENT_ID

uvicorn app.main:app --reload
```
API runs at http://localhost:8000  
Swagger docs at http://localhost:8000/docs

### 3. Frontend
```bash
cd frontend
npm install

cp .env.example .env
# Edit .env with VITE_AZURE_TENANT_ID and VITE_AZURE_CLIENT_ID

npm run dev
```
App runs at http://localhost:5173

---

## Azure AD Setup

1. Register an app in Azure AD (Entra ID)
2. Set Redirect URI to `http://localhost:5173` (and your production URL)
3. Under **Expose an API**, add scope `user_impersonation`
4. Copy **Tenant ID** and **Application (client) ID** into both `.env` files

The first user to sign in becomes a regular `user`. Promote them to `admin` directly in the database:
```sql
UPDATE users SET role = 'admin' WHERE email = 'your.email@sigvaris.com';
```
After that, use the Admin page to manage roles.

---

## Budget Excel Format

Finance uploads `.xlsx` files with these columns (header row is auto-detected):

| Column A | Column B | Column C |
|----------|----------|----------|
| Code     | Name     | Amount   |
| 4100     | Travel & Accommodation | 50000 |

---

## User Roles

| Role    | Capabilities |
|---------|-------------|
| `user`  | View their cost centers, assign invoices, set approvers |
| `finance` | Upload invoices + budgets, view all cost centers |
| `admin` | Everything + manage users, cost centers, and members |

---

## Invoice Flow

```
Finance uploads PDF + vendor
        ↓
Status: pending_assignment
        ↓
Cost center owner fills in amount, due date,
allocates to budget lines (split allowed),
sets 2 approvers
        ↓
Status: pending_approval
        ↓
Approver 1 approves → Approver 2 approves
        ↓
Status: approved
(any rejection → status: rejected)
```
All steps are fully auditable via the invoice audit log.
