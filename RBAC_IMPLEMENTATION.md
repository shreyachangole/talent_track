#!/usr/bin/env bash

# TALENT_TRACK RBAC IMPLEMENTATION GUIDE
# ======================================
# This guide provides detailed instructions for implementing and extending
# the Role-Based Access Control (RBAC) system in CareerConnects

## FILES OVERVIEW

The RBAC system consists of:

1. **rbac.middleware.js** - Core RBAC middleware and utilities
   - Authentication middleware
   - Authorization middleware
   - Permission checking
   - JWT token generation/verification
   - Audit logging
   - Rate limiting

2. **server-rbac.js** - Updated Express server with RBAC integration
   - Updated database schemas with role fields
   - Protected routes with RBAC middleware
   - Authentication endpoints
   - User management endpoints
   - Audit log endpoints

## QUICK START

### 1. Installation & Setup

```bash
# Install dependencies
npm install

# Create environment configuration
cp .env.example .env

# Update .env with your secrets
JWT_SECRET=your-super-secret-key-change-in-production
JWT_REFRESH_SECRET=your-refresh-secret-key-change-in-production
NODE_ENV=development
```

### 2. Start the Server with RBAC

```bash
# Run the RBAC-enabled server
node server-rbac.js

# Server will start on http://127.0.0.1:3000
# Logs directory will be created at ./logs/
```

### 3. First Admin Setup

Before any admin can log in, create the initial admin account:

```bash
# Use MongoDB directly or create a seed script
db.admins.insertOne({
  name: "System Administrator",
  email: "admin@example.com",
  username: "admin",
  password: bcrypt.hashSync("AdminPassword123!", 10),
  role: "SUPERADMIN",
  isActive: true,
  createdAt: new Date()
})
```

## MIDDLEWARE USAGE

### 1. Authentication Middleware

Verifies JWT token and extracts user information.

```javascript
const { authenticate } = require('./rbac.middleware');

// Protect an endpoint
app.get('/protected', authenticate, (req, res) => {
  // req.user contains: { userId, role, email, type }
  console.log(`Authenticated user: ${req.user.userId} (${req.user.role})`);
  res.json({ message: 'You are authenticated' });
});
```

### 2. Authorization Middleware

Restricts access to specific roles.

```javascript
const { authenticate, authorize } = require('./rbac.middleware');

// Restrict to admins and superadmins
app.get('/admin-only', authenticate, authorize('ADMIN', 'SUPERADMIN'), (req, res) => {
  res.json({ message: 'Admin access granted' });
});

// Restrict to students only
app.get('/student-area', authenticate, authorize('STUDENT'), (req, res) => {
  res.json({ message: 'Student access granted' });
});
```

### 3. Permission-Based Middleware

Fine-grained control using permissions.

```javascript
const { authenticate, requirePermission } = require('./rbac.middleware');

// Require specific permission
app.post('/announcements', 
  authenticate, 
  requirePermission('create_announcements'),
  async (req, res) => {
    // Only users with 'create_announcements' permission can access
    res.json({ message: 'Announcement created' });
  }
);
```

### 4. Owner or Admin Check

Verify resource ownership before allowing modifications.

```javascript
const { authenticate, isOwnerOrAdmin } = require('./rbac.middleware');

app.put('/profiles/:userId',
  authenticate,
  isOwnerOrAdmin,
  async (req, res) => {
    // User can only update own profile or admins can update any profile
    res.json({ message: 'Profile updated' });
  }
);
```

### 5. Rate Limiting

Prevent brute force attacks on login endpoints.

```javascript
const { rateLimitLogin } = require('./rbac.middleware');

app.post('/auth/login', rateLimitLogin, async (req, res) => {
  // Max 5 attempts per 15 minutes
  res.json({ message: 'Login successful' });
});
```

## EXTENDING RBAC

### Add a New Role

Edit `rbac.middleware.js`:

```javascript
const ROLES = {
    // Existing roles...
    RECRUITER: {
        name: 'RECRUITER',
        permissions: [
            'view_own_profile',
            'update_own_profile',
            'search_students',
            'post_jobs',
            'delete_own_jobs',
            'schedule_interviews',
        ]
    }
};
```

### Add a New Permission

1. Define in ROLES:
```javascript
ADMIN: {
    name: 'ADMIN',
    permissions: [
        // ... existing permissions
        'export_analytics',  // NEW
        'manage_payments',   // NEW
    ]
}
```

2. Use in route:
```javascript
app.get('/admin/export', 
  authenticate,
  requirePermission('export_analytics'),
  (req, res) => { ... }
);
```

### Add a New Protected Endpoint

Pattern:

```javascript
// 1. Import middleware
const { authenticate, authorize, requirePermission } = require('./rbac.middleware');

// 2. Define route with appropriate middleware chain
app.post('/api/resource',
  authenticate,                           // Verify user is logged in
  authorize('ADMIN', 'COMPANY'),         // Check role
  requirePermission('create_resource'),  // Check specific permission
  async (req, res) => {
    try {
      // Get authenticated user info
      const userId = req.user.userId;
      const userRole = req.user.role;
      
      // Business logic...
      
      // Log action
      const { AuditLogger } = require('./rbac.middleware');
      AuditLogger.log('RESOURCE_CREATED', userId, userRole, '/api/resource', 'SUCCESS', {
        resourceId: newResource._id.toString()
      });
      
      res.status(201).json({
        success: true,
        message: 'Resource created',
        resource: newResource
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to create resource',
        error: error.message
      });
    }
  }
);
```

## AUDIT LOGGING

### View Audit Logs

```bash
# Via API (Admin only)
curl http://localhost:3000/admin/audit-logs \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# Via file
cat logs/audit.log | jq '.' | tail -20
```

### Audit Log Format

```json
{
  "timestamp": "2024-06-19T10:30:45.123Z",
  "action": "LOGIN_SUCCESS",
  "userId": "507f1f77bcf86cd799439011",
  "userRole": "STUDENT",
  "resource": "/auth/student/login",
  "status": "SUCCESS",
  "ipAddress": "192.168.1.100",
  "details": {
    "email": "student@example.com"
  }
}
```

### Log Custom Events

```javascript
const { AuditLogger } = require('./rbac.middleware');

AuditLogger.log(
  'CUSTOM_EVENT',                 // Action name
  req.user.userId,               // User ID
  req.user.role,                 // User role
  '/api/resource',               // Resource/endpoint
  'SUCCESS',                     // Status (SUCCESS, FAILURE, DENIED)
  {                              // Additional details
    resourceId: '123',
    details: 'Custom data',
    ipAddress: req.ip
  }
);
```

## TESTING RBAC

### Unit Test Example (Jest)

```javascript
const request = require('supertest');
const app = require('./server-rbac');

describe('RBAC Authorization', () => {
  let studentToken, adminToken;

  beforeAll(async () => {
    // Login as student
    const res1 = await request(app)
      .post('/auth/student/login')
      .send({ username: 'student1', password: 'pass123' });
    studentToken = res1.body.accessToken;

    // Login as admin
    const res2 = await request(app)
      .post('/auth/admin/login')
      .send({ username: 'admin1', password: 'pass123' });
    adminToken = res2.body.accessToken;
  });

  test('Student should NOT access admin endpoints', async () => {
    const res = await request(app)
      .get('/admin/students')
      .set('Authorization', `Bearer ${studentToken}`);
    
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTHZ_FORBIDDEN');
  });

  test('Admin should access admin endpoints', async () => {
    const res = await request(app)
      .get('/admin/students')
      .set('Authorization', `Bearer ${adminToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('Missing token should return 401', async () => {
    const res = await request(app)
      .get('/admin/students');
    
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_TOKEN_MISSING');
  });
});
```

## PRODUCTION DEPLOYMENT CHECKLIST

- [ ] Change `JWT_SECRET` and `JWT_REFRESH_SECRET` environment variables
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/TLS on all endpoints
- [ ] Configure CORS to restrict to known domains
- [ ] Set up log rotation for audit logs
- [ ] Configure database backups
- [ ] Enable MongoDB authentication
- [ ] Set up monitoring and alerts
- [ ] Implement API rate limiting globally
- [ ] Configure secure session storage
- [ ] Enable HTTP security headers (Helmet.js)
- [ ] Test token refresh flow
- [ ] Document admin account recovery procedures
- [ ] Set up 2FA for admin accounts
- [ ] Review and test all permission combinations

## COMMON ISSUES & SOLUTIONS

### Issue: "AUTH_TOKEN_INVALID" on every request

**Solution:** Check that:
1. Token is being sent in Authorization header
2. Format is: `Authorization: Bearer <token>`
3. Token hasn't expired
4. JWT_SECRET matches between token generation and verification

### Issue: Permission denied for all users

**Solution:**
1. Verify user role is correct in database
2. Check ROLES definition includes the role
3. Verify permission is in the role's permissions array
4. Check middleware chain order (authenticate before authorize)

### Issue: Audit logs not being created

**Solution:**
1. Verify logs directory exists: `ls -la logs/`
2. Check file permissions: `chmod 755 logs/`
3. Verify AuditLogger.log() is being called
4. Check Node.js has write permissions to logs directory

### Issue: Account locked but shouldn't be

**Solution:**
1. Clear login attempts: Update user's `loginAttempts` to 0 in MongoDB
2. Clear lockout: Update user's `lockedUntil` to null
3. Manual fix:
```bash
db.students.updateOne(
  { username: 'user@example.com' },
  { $set: { loginAttempts: 0, lockedUntil: null } }
)
```

## API RESPONSE CODES

| Code | Meaning | Example |
|------|---------|---------|
| 200 | OK - Request successful | Login successful |
| 201 | Created - Resource created | Registration successful |
| 400 | Bad Request - Invalid input | Missing required field |
| 401 | Unauthorized - No/invalid auth | Missing token |
| 403 | Forbidden - Insufficient perms | Student accessing admin endpoint |
| 404 | Not Found - Resource doesn't exist | User profile not found |
| 429 | Rate Limited - Too many requests | Too many login attempts |
| 500 | Server Error | Database connection failed |

## SUPPORT & CONTRIBUTIONS

For issues or improvements to the RBAC system:

1. Check audit logs for troubleshooting
2. Review error codes in response body
3. Consult this documentation
4. Submit bug reports with:
   - Error message and code
   - User role involved
   - Exact endpoint called
   - Steps to reproduce

---

**Document Version:** 1.0  
**Last Updated:** 2024-06-19  
**Compatible with:** Node.js 18.x+, Express.js 4.21.0+, MongoDB 8.7.0+
