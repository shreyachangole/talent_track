# RBAC Quick Reference Guide

## 🔑 Key Files

| File | Purpose | Key Content |
|------|---------|-------------|
| `rbac.middleware.js` | Core RBAC system | Middleware, JWT management, audit logging |
| `server-rbac.js` | RBAC-enabled server | Updated routes with auth/authz |
| `RBAC_IMPLEMENTATION.md` | Developer guide | How to use and extend RBAC |
| `RBAC_MIGRATION_GUIDE.md` | Upgrade instructions | Step-by-step migration from old system |
| `.env.example` | Configuration template | Environment variables reference |

---

## 🚀 Quick Start

```bash
# 1. Setup environment
cp .env.example .env
# Edit .env with your JWT secrets

# 2. Update database schema
# Run MongoDB migration commands (see RBAC_MIGRATION_GUIDE.md)

# 3. Start server
node server-rbac.js

# 4. Test it
curl http://localhost:3000/health
```

---

## 🔐 Roles Summary

| Role | Level | Key Permissions |
|------|-------|-----------------|
| **STUDENT** | User | View own profile, submit assessments, apply for jobs |
| **ADMIN** | Organization | Manage all users, create announcements, view audit logs |
| **COMPANY** | Organization | Search students, post jobs, schedule interviews |
| **SUPERADMIN** | System | All permissions (* wildcard) |

---

## 📝 Protecting Endpoints - Quick Patterns

```javascript
// Public endpoint (no auth needed)
app.get('/announcements', handler);

// Authenticated endpoint (any logged-in user)
app.get('/auth/profile', authenticate, handler);

// Role-restricted endpoint
app.get('/admin/students', authenticate, authorize('ADMIN', 'SUPERADMIN'), handler);

// Permission-based endpoint
app.post('/announcements', authenticate, requirePermission('create_announcements'), handler);

// Owner or admin endpoint
app.put('/profile/:userId', authenticate, isOwnerOrAdmin, handler);

// Rate-limited endpoint (login)
app.post('/login', rateLimitLogin, handler);
```

---

## 🔒 Authentication Flow

```
User submits credentials
        ↓
Rate limit check (5 attempts / 15 min)
        ↓
Password verification (bcrypt)
        ↓
Generate JWT tokens
        ↓
Return accessToken + refreshToken to client
        ↓
Client stores tokens (localStorage/sessionStorage)
        ↓
Client includes token in Authorization header for subsequent requests
```

---

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { /* result data */ }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Human-readable error message",
  "code": "ERROR_CODE",
  "details": { /* optional additional info */ }
}
```

---

## 🔑 JWT Token Headers

### Access Token (short-lived: 15 min)
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Refresh Token (long-lived: 7 days)
```
Used in POST /auth/token/refresh body:
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

## 🛡️ Security Checklist

- [ ] JWT_SECRET changed from default in production
- [ ] JWT_REFRESH_SECRET changed from default in production
- [ ] HTTPS enabled in production
- [ ] CORS configured to trusted domains only
- [ ] Rate limiting enabled on all login endpoints
- [ ] Audit logging enabled and monitored
- [ ] Database backups configured
- [ ] MongoDB authentication enabled
- [ ] Token storage secure (HttpOnly cookies preferred)
- [ ] 2FA implemented for admin accounts

---

## 🐛 Common Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| `AUTH_TOKEN_MISSING` | No Authorization header | Add token to header |
| `AUTH_TOKEN_INVALID` | Token expired/tampered | Login again for new token |
| `AUTHZ_FORBIDDEN` | Insufficient role | Use appropriate user account |
| `PERM_DENIED` | Permission not granted | Verify permission in user role |
| `ACCOUNT_LOCKED` | Too many login attempts | Wait 15 minutes |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Wait and retry |
| `USER_EXISTS` | Email/username taken | Use different credentials |
| `VALIDATION_ERROR` | Missing required fields | Check request body |

---

## 📋 Middleware Chain Order

**IMPORTANT:** Middleware must be in this order:

1. `authenticate` - Verify JWT token first
2. `authorize` - Check role (requires auth)
3. `requirePermission` - Check permission (requires auth)
4. `isOwnerOrAdmin` - Check ownership (requires auth)
5. `rateLimitLogin` - Only for login endpoints

```javascript
// ✅ CORRECT ORDER
app.post('/announcements',
  authenticate,           // 1st
  authorize('ADMIN'),     // 2nd
  requirePermission('create_announcements'),  // 3rd
  handler
);

// ❌ WRONG ORDER (won't work)
app.post('/announcements',
  authorize('ADMIN'),     // ERROR: user not authenticated yet
  authenticate,
  handler
);
```

---

## 🔍 Audit Log Viewing

```bash
# View audit logs via API
curl http://localhost:3000/admin/audit-logs \
  -H "Authorization: Bearer <ADMIN_TOKEN>"

# View audit logs via file
tail -f logs/audit.log

# Filter audit logs (example)
grep "LOGIN_FAILED" logs/audit.log

# Parse JSON logs
cat logs/audit.log | jq 'select(.action=="BRUTE_FORCE_ATTEMPT")'
```

---

## 🔄 Token Refresh Flow

```
1. Access token near expiry (or expired)
2. Client calls POST /auth/token/refresh with refreshToken
3. Server validates refreshToken
4. Server generates new accessToken
5. Client stores new accessToken
6. Client retries original request with new token
```

---

## 📚 Documentation Files

1. **README.md** - Complete system overview with RBAC section
2. **RBAC_IMPLEMENTATION.md** - Detailed developer guide
3. **RBAC_MIGRATION_GUIDE.md** - Upgrade instructions from old system
4. **rbac.middleware.js** - Source code with inline comments
5. **server-rbac.js** - Example implementations
6. **.env.example** - Configuration reference

---

## 🚨 Important: Production Deployment

Before going to production:

```bash
# 1. Generate strong secrets
export JWT_SECRET=$(openssl rand -base64 32)
export JWT_REFRESH_SECRET=$(openssl rand -base64 32)

# 2. Set environment
export NODE_ENV=production

# 3. Enable HTTPS
# Configure SSL certificates

# 4. Setup CORS
export ALLOWED_ORIGINS=https://yourdomain.com

# 5. Configure database authentication
# Enable MongoDB auth

# 6. Setup monitoring
# Monitor audit logs
# Monitor failed logins
# Monitor token refresh

# 7. Backup strategy
# Daily MongoDB backups
# Secure backup storage
```

---

## 📞 Quick Debugging

```bash
# Check if server is running
curl http://localhost:3000/health

# Test without authentication (should fail with 401)
curl http://localhost:3000/admin/students

# Check JWT token validity
# Decode at: https://jwt.io/ (never paste production tokens!)

# Monitor live logs
tail -f logs/audit.log | grep "LOGIN"

# Check for locked accounts
grep "ACCOUNT_LOCKED\|BRUTE_FORCE" logs/audit.log

# Verify user roles in database
db.students.find({ username: "testuser" }).pretty()
```

---

## 🎯 Next Steps

1. **Review** - Read RBAC_IMPLEMENTATION.md for detailed guide
2. **Test** - Follow testing examples in RBAC_MIGRATION_GUIDE.md
3. **Deploy** - Use migration guide for production deployment
4. **Monitor** - Set up audit log monitoring
5. **Extend** - Add custom roles/permissions as needed

---

**Version:** 1.0.0  
**Last Updated:** 2024-06-19  
**Status:** Production Ready
