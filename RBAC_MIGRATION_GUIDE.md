# RBAC Implementation - Migration & Upgrade Guide

## 🚀 What's New in RBAC Version 1.0

### Key Features
✅ **JWT Token-Based Authentication** - Stateless, scalable authentication  
✅ **Role-Based Authorization** - 4 distinct user roles with fine-grained permissions  
✅ **Comprehensive Audit Logging** - Track all security and data access events  
✅ **Brute Force Protection** - Account lockout after failed attempts  
✅ **Permission-Based Access Control** - Granular control beyond just roles  
✅ **Token Refresh Mechanism** - Secure token rotation for long sessions  
✅ **Owner Resource Verification** - Prevent unauthorized data access  

### Breaking Changes from Previous Version
⚠️ **Login Response Format** - Now returns JWT tokens instead of user data only  
⚠️ **Authentication Required** - Most endpoints now require valid JWT token  
⚠️ **Role Field Required** - All user documents must have a `role` field  
⚠️ **Token-Based Requests** - All API calls must include Authorization header  

---

## 📋 Pre-Migration Checklist

Before upgrading to RBAC, ensure:

- [ ] MongoDB database is backed up
- [ ] Current server.js is working and stable
- [ ] Node.js version is 18.x or higher
- [ ] All dependencies in package.json are installed
- [ ] Redis is running (for caching)
- [ ] No critical operations are in progress
- [ ] Team is notified of the upgrade

---

## 🔄 Migration Steps

### Step 1: Backup Everything

```bash
# Backup MongoDB
mongodump --uri "mongodb://localhost:27017/studentDB" --out ./backup/$(date +%Y%m%d_%H%M%S)

# Backup current server files
cp server.js server.js.backup
cp package.json package.json.backup
```

### Step 2: Create .env File

```bash
# Copy the example configuration
cp .env.example .env

# Edit with your values
nano .env
```

Update critical values in `.env`:
```bash
JWT_SECRET=<generate-new-random-string>
JWT_REFRESH_SECRET=<generate-new-random-string>
NODE_ENV=production  # if deploying to production
```

### Step 3: Update Database Schema

The RBAC version adds new fields to user collections. Run this migration:

```bash
# Connect to MongoDB
mongo mongodb://localhost:27017/studentDB

# Run migration commands
db.students.updateMany(
  { role: { $exists: false } },
  { 
    $set: { 
      role: "STUDENT",
      isActive: true,
      lastLogin: null,
      loginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
)

db.admins.updateMany(
  { role: { $exists: false } },
  { 
    $set: { 
      role: "ADMIN",
      isActive: true,
      lastLogin: null,
      loginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
)

db.companies.updateMany(
  { role: { $exists: false } },
  { 
    $set: { 
      role: "COMPANY",
      isActive: true,
      isVerified: false,
      lastLogin: null,
      loginAttempts: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }
)

# Verify migration
db.students.findOne({})
```

### Step 4: Review RBAC Middleware

Examine the new middleware:

```bash
# Review RBAC implementation
less rbac.middleware.js

# Key sections to understand:
# - ROLES definition (line ~43)
# - Middleware exports (line ~320)
# - AuditLogger class (line ~116)
```

### Step 5: Test RBAC Server (Non-Production)

```bash
# Start the new RBAC server
node server-rbac.js

# Should see: 🚀 Server running with RBAC support on http://127.0.0.1:3000
```

### Step 6: Test Authentication Flow

```bash
# Test Student Registration
curl -X POST http://localhost:3000/auth/student/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Student",
    "email": "test@example.com",
    "username": "teststudent",
    "password": "TestPass123!",
    "college": "Test University",
    "department": "Computer Science"
  }'

# Test Student Login
curl -X POST http://localhost:3000/auth/student/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "teststudent",
    "password": "TestPass123!"
  }'

# Save the accessToken from response, then test protected endpoint:

# Test Protected Endpoint
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### Step 7: Verify All Endpoints

Test critical endpoints with appropriate user types:

```bash
# Student endpoints
curl -X GET http://localhost:3000/announcements

# Admin endpoints
curl -X GET http://localhost:3000/admin/students \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Company endpoints
curl -X POST http://localhost:3000/auth/company/login \
  -H "Content-Type: application/json" \
  -d '{"username": "company1", "password": "pass123"}'
```

### Step 8: Update Frontend (If Needed)

Frontend must now:

1. **Store JWT tokens** from login response
2. **Include Authorization header** in all API requests
3. **Handle token expiration** - implement token refresh
4. **Display proper error messages** for auth failures

Example frontend update:

```javascript
// Old way (no longer works)
const response = await fetch('http://localhost:3000/auth/profile');

// New way (RBAC-enabled)
const token = localStorage.getItem('accessToken');
const response = await fetch('http://localhost:3000/auth/profile', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});

// Handle 401 (token expired)
if (response.status === 401) {
  // Refresh token
  const refreshResponse = await fetch('http://localhost:3000/auth/token/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: localStorage.getItem('refreshToken') })
  });
  
  if (refreshResponse.ok) {
    const data = await refreshResponse.json();
    localStorage.setItem('accessToken', data.accessToken);
    // Retry original request
  } else {
    // Redirect to login
    window.location.href = '/login';
  }
}
```

### Step 9: Switch to Production

```bash
# Stop old server
# Update your startup script or process manager to use server-rbac.js

# Option 1: Direct execution
node server-rbac.js

# Option 2: Using PM2
pm2 start server-rbac.js --name "talent-track"

# Option 3: Using Docker
docker run -e NODE_ENV=production talent-track node server-rbac.js

# Verify server is running
curl http://localhost:3000/health
```

### Step 10: Monitor & Verify

```bash
# Check for errors in console
# Monitor audit logs
tail -f logs/audit.log

# Monitor failed logins
grep "LOGIN_FAILURE\|BRUTE_FORCE" logs/audit.log

# Check MongoDB for login timestamps
db.students.find({ lastLogin: { $exists: true } }).pretty()
```

---

## 🔀 Rollback Plan (If Issues Occur)

If you need to revert to the old system:

```bash
# Stop RBAC server
# Ctrl+C or
# kill <process-id>

# Restore old server
cp server.js.backup server.js

# Restore old package.json if needed
cp package.json.backup package.json

# Restart old server
node server.js

# The system will work as before
# (No data loss - only new fields added to collections)
```

---

## 📊 Verification Checklist After Migration

Run these tests to verify successful migration:

```bash
# 1. Check server health
curl http://localhost:3000/health
# Expected: { "success": true, "message": "Server is running" }

# 2. Test student registration
curl -X POST http://localhost:3000/auth/student/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","email":"test@test.com","username":"test","password":"Pass123!"}'

# 3. Test student login
curl -X POST http://localhost:3000/auth/student/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"Pass123!"}'
# Expected: { "success": true, "accessToken": "...", "refreshToken": "..." }

# 4. Test protected endpoint
# Use token from step 3
curl -X GET http://localhost:3000/auth/profile \
  -H "Authorization: Bearer <TOKEN>"

# 5. Test unauthorized access (should fail)
curl -X GET http://localhost:3000/admin/students
# Expected: { "success": false, "code": "AUTH_TOKEN_MISSING" }

# 6. Test admin endpoint with student token (should fail)
curl -X GET http://localhost:3000/admin/students \
  -H "Authorization: Bearer <STUDENT_TOKEN>"
# Expected: { "success": false, "code": "AUTHZ_FORBIDDEN" }

# 7. View audit logs
curl -X GET http://localhost:3000/admin/audit-logs \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# 8. Check token refresh
curl -X POST http://localhost:3000/auth/token/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<REFRESH_TOKEN>"}'

# 9. Test rate limiting (make 6 failed login attempts)
for i in {1..6}; do
  curl -X POST http://localhost:3000/auth/student/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"WrongPassword"}'
done
# Expected on 6th: { "success": false, "code": "RATE_LIMIT_EXCEEDED" }

# 10. Check database for new fields
db.students.findOne({ username: "test" })
# Should have: role, isActive, lastLogin, loginAttempts, lockedUntil, etc.
```

---

## 🆘 Troubleshooting Migration Issues

### Issue: "JWT_SECRET not defined"
**Solution:** Create .env file with JWT_SECRET defined

### Issue: "Cannot find module 'rbac.middleware.js'"
**Solution:** Ensure rbac.middleware.js is in the same directory as server-rbac.js

### Issue: "Role not found" errors
**Solution:** Run the MongoDB migration commands in Step 3

### Issue: "Collection creation fails"
**Solution:** Check MongoDB is running: `mongod --version`

### Issue: Students can access admin endpoints
**Solution:** 
1. Verify authenticate middleware is applied first
2. Check user.role is set correctly in JWT token
3. Review RBAC middleware authorize() function

### Issue: Audit logs not being created
**Solution:**
1. Verify logs directory exists: `mkdir -p logs`
2. Check Node.js has write permissions: `chmod 755 logs`
3. Verify AuditLogger.log() calls in routes

---

## 📚 Additional Resources

- [RBAC Implementation Guide](./RBAC_IMPLEMENTATION.md)
- [README.md - RBAC Section](./README.md#-role-based-access-control-rbac-system)
- [Middleware Source Code](./rbac.middleware.js)
- [Updated Server Code](./server-rbac.js)

---

## 📞 Support

For migration issues:
1. Check troubleshooting section above
2. Review audit logs for error details
3. Check MongoDB for schema issues
4. Review JWT token format
5. Check environment variables in .env

**Last Updated:** 2024-06-19  
**Version:** 1.0.0  
**Tested On:** Node.js 18.x, MongoDB 8.7.0, Express 4.21.0
