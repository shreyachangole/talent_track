/**
 * RBAC Middleware - Role-Based Access Control System
 * Implements industry-standard authentication and authorization patterns
 * Includes: JWT verification, role validation, permission checking, audit logging
 */

const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const AUDIT_LOG_FILE = path.join(__dirname, 'logs', 'audit.log');

// Ensure logs directory exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Role Definitions with Permissions
 * Follows principle of least privilege
 */
const ROLES = {
    STUDENT: {
        name: 'STUDENT',
        permissions: [
            'view_own_profile',
            'update_own_profile',
            'view_announcements',
            'submit_assessment',
            'view_own_results',
            'upload_resume',
            'view_companies',
            'apply_to_job',
        ]
    },
    ADMIN: {
        name: 'ADMIN',
        permissions: [
            'view_all_profiles',
            'update_user_profiles',
            'delete_users',
            'create_announcements',
            'delete_announcements',
            'manage_assessments',
            'view_all_results',
            'view_audit_logs',
            'manage_admins',
            'system_settings',
        ]
    },
    COMPANY: {
        name: 'COMPANY',
        permissions: [
            'view_own_profile',
            'update_own_profile',
            'view_student_profiles',
            'post_jobs',
            'delete_own_jobs',
            'view_applications',
            'create_announcements',
            'schedule_interviews',
            'view_proctored_tests',
        ]
    },
    SUPERADMIN: {
        name: 'SUPERADMIN',
        permissions: [
            '*', // All permissions
        ]
    }
};

/**
 * Audit Logger - Logs all authentication and authorization events
 */
class AuditLogger {
    static log(action, userId, userRole, resource, status, details = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            action,
            userId,
            userRole,
            resource,
            status, // 'SUCCESS', 'FAILURE', 'DENIED'
            details,
            ipAddress: details.ipAddress || 'unknown',
        };

        // Write to file
        const logString = JSON.stringify(logEntry) + '\n';
        fs.appendFile(AUDIT_LOG_FILE, logString, (err) => {
            if (err) console.error('Failed to write audit log:', err);
        });

        // Console output for development
        console.log(`[AUDIT] ${action} - ${userRole}:${userId} - ${status}`, details);
    }
}

/**
 * Generate JWT Tokens
 */
function generateTokens(userId, role, email) {
    const payload = {
        userId,
        role,
        email,
        type: 'access'
    };

    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
    
    const refreshPayload = {
        userId,
        role,
        type: 'refresh'
    };
    const refreshToken = jwt.sign(refreshPayload, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

    return { accessToken, refreshToken };
}

/**
 * Verify JWT Token
 */
function verifyToken(token, isRefresh = false) {
    try {
        const secret = isRefresh ? JWT_REFRESH_SECRET : JWT_SECRET;
        return jwt.verify(token, secret);
    } catch (error) {
        return null;
    }
}

/**
 * Authentication Middleware - Verifies JWT token
 * Extracts user info from token and attaches to request object
 */
function authenticate(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        
        if (!authHeader) {
            AuditLogger.log('AUTH_ATTEMPT', 'UNKNOWN', 'UNKNOWN', req.path, 'FAILURE', {
                reason: 'Missing authorization header',
                ipAddress: req.ip
            });
            return res.status(401).json({
                success: false,
                message: 'No authorization token provided',
                code: 'AUTH_TOKEN_MISSING'
            });
        }

        // Extract token from "Bearer <token>" format
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7) 
            : authHeader;

        const decoded = verifyToken(token);

        if (!decoded) {
            AuditLogger.log('AUTH_ATTEMPT', 'UNKNOWN', 'UNKNOWN', req.path, 'FAILURE', {
                reason: 'Invalid or expired token',
                ipAddress: req.ip
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token',
                code: 'AUTH_TOKEN_INVALID'
            });
        }

        // Attach user info to request
        req.user = decoded;
        
        AuditLogger.log('AUTH_SUCCESS', decoded.userId, decoded.role, req.path, 'SUCCESS', {
            ipAddress: req.ip
        });

        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            success: false,
            message: 'Authentication error',
            code: 'AUTH_ERROR'
        });
    }
}

/**
 * Authorization Middleware - Verifies user has required role(s)
 * Usage: authorize(['ADMIN', 'SUPERADMIN'])
 */
function authorize(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            AuditLogger.log('AUTHZ_ATTEMPT', 'UNKNOWN', 'UNKNOWN', req.path, 'FAILURE', {
                reason: 'User not authenticated',
                ipAddress: req.ip
            });
            return res.status(401).json({
                success: false,
                message: 'User not authenticated',
                code: 'AUTHZ_USER_NOT_FOUND'
            });
        }

        const userRole = req.user.role;

        if (!allowedRoles.includes(userRole)) {
            AuditLogger.log('AUTHZ_DENIED', req.user.userId, userRole, req.path, 'DENIED', {
                reason: `User role ${userRole} not in allowed roles`,
                allowedRoles,
                ipAddress: req.ip
            });
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions for this resource',
                code: 'AUTHZ_FORBIDDEN',
                userRole,
                requiredRoles: allowedRoles
            });
        }

        AuditLogger.log('AUTHZ_SUCCESS', req.user.userId, userRole, req.path, 'SUCCESS', {
            ipAddress: req.ip
        });

        next();
    };
}

/**
 * Permission-based Authorization Middleware
 * Usage: requirePermission('create_announcements')
 */
function requirePermission(permissionName) {
    return (req, res, next) => {
        if (!req.user) {
            AuditLogger.log('PERM_ATTEMPT', 'UNKNOWN', 'UNKNOWN', req.path, 'FAILURE', {
                reason: 'User not authenticated',
                ipAddress: req.ip
            });
            return res.status(401).json({
                success: false,
                message: 'User not authenticated',
                code: 'PERM_USER_NOT_FOUND'
            });
        }

        const userRole = ROLES[req.user.role];

        if (!userRole) {
            AuditLogger.log('PERM_DENIED', req.user.userId, req.user.role, req.path, 'DENIED', {
                reason: 'Invalid role',
                ipAddress: req.ip
            });
            return res.status(403).json({
                success: false,
                message: 'Invalid user role',
                code: 'PERM_INVALID_ROLE'
            });
        }

        const hasPermission = userRole.permissions.includes('*') || 
                            userRole.permissions.includes(permissionName);

        if (!hasPermission) {
            AuditLogger.log('PERM_DENIED', req.user.userId, req.user.role, req.path, 'DENIED', {
                reason: `Permission ${permissionName} denied`,
                ipAddress: req.ip
            });
            return res.status(403).json({
                success: false,
                message: `Permission '${permissionName}' required`,
                code: 'PERM_FORBIDDEN',
                requiredPermission: permissionName
            });
        }

        AuditLogger.log('PERM_GRANTED', req.user.userId, req.user.role, req.path, 'SUCCESS', {
            permission: permissionName,
            ipAddress: req.ip
        });

        next();
    };
}

/**
 * Owner-only Middleware - Verify user owns the resource
 * Expects userId in req.params.userId or req.body.userId
 */
function isOwnerOrAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'User not authenticated',
            code: 'OWNER_USER_NOT_FOUND'
        });
    }

    const targetUserId = req.params.userId || req.body.userId;
    const isOwner = req.user.userId === targetUserId;
    const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN';

    if (!isOwner && !isAdmin) {
        AuditLogger.log('OWNER_CHECK_FAILED', req.user.userId, req.user.role, req.path, 'DENIED', {
            reason: 'User is not owner or admin',
            targetUserId,
            ipAddress: req.ip
        });
        return res.status(403).json({
            success: false,
            message: 'You can only access your own data',
            code: 'OWNER_NOT_AUTHORIZED'
        });
    }

    next();
}

/**
 * Token Refresh Middleware - Generate new access token from refresh token
 */
function refreshAccessToken(req, res) {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token required',
                code: 'REFRESH_TOKEN_MISSING'
            });
        }

        const decoded = verifyToken(refreshToken, true);

        if (!decoded) {
            AuditLogger.log('REFRESH_FAILED', 'UNKNOWN', 'UNKNOWN', '/token/refresh', 'FAILURE', {
                reason: 'Invalid refresh token',
                ipAddress: req.ip
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired refresh token',
                code: 'REFRESH_TOKEN_INVALID'
            });
        }

        // Generate new access token
        const payload = {
            userId: decoded.userId,
            role: decoded.role,
        };
        const newAccessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });

        AuditLogger.log('REFRESH_SUCCESS', decoded.userId, decoded.role, '/token/refresh', 'SUCCESS', {
            ipAddress: req.ip
        });

        res.json({
            success: true,
            message: 'Access token refreshed',
            accessToken: newAccessToken,
            expiresIn: ACCESS_TOKEN_EXPIRY
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            message: 'Token refresh failed',
            code: 'REFRESH_ERROR'
        });
    }
}

/**
 * Rate Limiting Middleware - Prevent brute force attacks
 */
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

function rateLimitLogin(req, res, next) {
    const identifier = req.body.username || req.body.email;
    const now = Date.now();

    if (!loginAttempts.has(identifier)) {
        loginAttempts.set(identifier, []);
    }

    const attempts = loginAttempts.get(identifier);
    const recentAttempts = attempts.filter(time => now - time < LOCKOUT_DURATION);

    if (recentAttempts.length >= MAX_ATTEMPTS) {
        AuditLogger.log('BRUTE_FORCE_ATTEMPT', identifier, 'UNKNOWN', req.path, 'DENIED', {
            reason: 'Too many login attempts',
            ipAddress: req.ip
        });
        return res.status(429).json({
            success: false,
            message: 'Too many login attempts. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: Math.ceil(LOCKOUT_DURATION / 1000)
        });
    }

    recentAttempts.push(now);
    loginAttempts.set(identifier, recentAttempts);
    next();
}

/**
 * Clear failed login attempts on successful login
 */
function clearLoginAttempts(identifier) {
    loginAttempts.delete(identifier);
}

module.exports = {
    // Middleware
    authenticate,
    authorize,
    requirePermission,
    isOwnerOrAdmin,
    rateLimitLogin,
    refreshAccessToken,

    // Utils
    generateTokens,
    verifyToken,
    clearLoginAttempts,

    // Constants
    ROLES,
    JWT_SECRET,
    JWT_REFRESH_SECRET,
    AuditLogger,
};
