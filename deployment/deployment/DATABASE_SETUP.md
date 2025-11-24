# 🚀 Stellarion Furniture - Full Stack Setup Guide

A modern furniture e-commerce platform with MySQL database, user authentication, and 3D model generation.

## 📋 Prerequisites

Before you start, make sure you have the following installed:

- **Node.js** (v14 or higher)
- **MySQL** (v8.0 or higher)
- **PHPMyAdmin** (for database management)
- **XAMPP** or **WAMP** (recommended for easy MySQL setup)

## 🗄️ Database Setup

### Step 1: Start MySQL Server

1. Start **XAMPP** or your MySQL server
2. Make sure MySQL is running on `localhost:3306`

### Step 2: Create Database Using PHPMyAdmin

1. Open PHPMyAdmin in your browser: `http://localhost/phpmyadmin`
2. Click on **SQL** tab
3. Copy and paste the contents of `database/setup.sql`
4. Click **Go** to execute the SQL script

This will create:
- ✅ Database: `stellarion_furniture`
- ✅ Table: `users` (with sample admin and customer users)
- ✅ Table: `furniture_companies` (with 2 sample companies)

### Step 3: Configure Database Connection

1. Copy the `.env` file and update your database credentials:

```env
# Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password_here
DB_NAME=stellarion_furniture
DB_PORT=3306
```

## 🔧 Backend Setup

### Step 1: Install Dependencies

```bash
npm install
```

### Step 2: Start the Server

```bash
# For development with auto-reload
npm run dev

# Or for production
npm start
```

The server will start on `http://localhost:3000`

## 📊 Database Structure

### Users Table
```sql
- id (Primary Key)
- username (Unique)
- email (Unique)
- password (Hashed)
- first_name, last_name
- phone, address, city, country
- user_type (customer/admin)
- created_at, updated_at
```

### Furniture Companies Table
```sql
- id (Primary Key)
- company_name, brand_name
- description, website_url
- contact_email, contact_phone
- address, city, country
- specialties (JSON array)
- rating, total_reviews
- is_verified, is_active
- social_media (JSON)
- certifications (JSON)
- created_at, updated_at
```

## 🔐 API Endpoints

### Authentication Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/users/register` | Register new user | ❌ |
| POST | `/api/users/login` | User login | ❌ |
| GET | `/api/users/profile` | Get user profile | ✅ |
| PUT | `/api/users/profile` | Update profile | ✅ |

### Company Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/companies` | Get all companies | ❌ |
| GET | `/api/companies/:id` | Get company by ID | ❌ |
| POST | `/api/companies` | Create company | ✅ Admin |
| PUT | `/api/companies/:id` | Update company | ✅ Admin |
| DELETE | `/api/companies/:id` | Delete company | ✅ Admin |

### 3D Model Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/create-3d-model` | Generate 3D from image |
| GET | `/api/check-status/:id` | Check generation status |
| GET | `/api/download/:id` | Download 3D model |

## 🧪 Testing the API

### 1. Test Health Endpoint
```bash
curl http://localhost:3000/api/health
```

### 2. Test User Registration
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### 3. Test User Login
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "login": "test@example.com",
    "password": "password123"
  }'
```

### 4. Get All Companies
```bash
curl http://localhost:3000/api/companies
```

## 🔑 Sample Users Created

### Admin User
- **Username**: `admin_stellarion`
- **Email**: `admin@stellarion.com`
- **Type**: Admin

### Customer User
- **Username**: `john_customer`
- **Email**: `john.doe@email.com`
- **Type**: Customer

> **Note**: Passwords are hashed. You'll need to register new users or reset passwords through the API.

## 🏢 Sample Companies Created

1. **ScandiHome** - Scandinavian furniture specialists
2. **LuxuryLiving** - Premium luxury furniture

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Start development server (with auto-reload)
npm run dev

# Start production server
npm start

# Install additional dependencies
npm install express mysql2 bcryptjs jsonwebtoken cors dotenv body-parser multer
npm install --save-dev nodemon
```

## 🚀 Next Steps

1. ✅ Database is set up with sample data
2. ✅ Backend API is running
3. ✅ Authentication system is working
4. ✅ 3D model generation is integrated
5. 🔄 Connect frontend to use the API endpoints
6. 🔄 Add more features like products, orders, cart functionality

## ❗ Troubleshooting

### Database Connection Issues
- Make sure MySQL is running
- Check your `.env` file credentials
- Verify database name exists in PHPMyAdmin

### Port Already in Use
- Change the PORT in `.env` file
- Or stop other applications using port 3000

### API Errors
- Check server logs for detailed error messages
- Verify request format matches the API documentation

## 📞 Support

If you need help, check the server logs in the terminal where you ran `npm start` for detailed error messages.

---

**Ready to build something amazing! 🎉**