const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const redisClient = require('./redis.config');
const { cacheMiddleware, invalidateCacheMiddleware } = require('./redis.middleware');
const { CACHE_KEYS, TTL } = require('./redis.utils');

// Import RBAC middleware
const {
    authenticate,
    authorize,
    requirePermission,
    isOwnerOrAdmin,
    rateLimitLogin,
    refreshAccessToken,
    generateTokens,
    clearLoginAttempts,
    AuditLogger,
    ROLES,
} = require('./rbac.middleware');

const app = express();
const port = 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/studentDB')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log('MongoDB connection error:', err));

/**
 * UPDATED SCHEMAS WITH RBAC SUPPORT
 */

// Student Schema - Updated with role and security fields
const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: String,
    dob: Date,
    college: String,
    department: String,
    gender: String,
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'STUDENT', enum: ['STUDENT'] },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const Student = mongoose.model('Student', studentSchema);

// Admin Schema - Updated with role and security fields
const adminSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: String,
    position: String,
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'ADMIN', enum: ['ADMIN', 'SUPERADMIN'] },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const Admin = mongoose.model('Admin', adminSchema);

// Company Schema - Updated with role and security fields
const companySchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    company_add: String,
    phone: String,
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    role: { type: String, default: 'COMPANY', enum: ['COMPANY'] },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: false },
    lastLogin: Date,
    loginAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const Company = mongoose.model('Company', companySchema);

// Announcement Schema - Updated with creator tracking
const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    createdBy: { type: String, required: true }, // userId of creator
    creatorRole: { type: String, enum: ['ADMIN', 'COMPANY'] },
    isPublished: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
});

const Announcement = mongoose.model('Announcement', announcementSchema);

/**
 * HEALTH CHECK ENDPOINT
 */
app.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is running',
        timestamp: new Date().toISOString(),
    });
});

/**
 * TOKEN MANAGEMENT ENDPOINTS
 */

// Refresh Access Token
app.post('/auth/token/refresh', refreshAccessToken);

/**
 * AUTHENTICATION ROUTES
 */

// Student Registration
app.post('/auth/student/register', rateLimitLogin, async (req, res) => {
    try {
        const { name, email, phone, dob, college, department, gender, username, password } = req.body;

        // Validation
        if (!name || !email || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, username, and password are required',
                code: 'VALIDATION_ERROR'
            });
        }

        // Check if username or email already exists
        const existingUser = await Student.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Username or email already registered',
                code: 'USER_EXISTS'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        const newStudent = new Student({
            name,
            email,
            phone,
            dob,
            college,
            department,
            gender,
            username,
            password: hashedPassword,
            role: 'STUDENT',
            isActive: true,
        });

        await newStudent.save();

        AuditLogger.log('STUDENT_REGISTRATION', newStudent._id.toString(), 'STUDENT', '/auth/student/register', 'SUCCESS', {
            email: newStudent.email,
            username: newStudent.username,
        });

        res.status(201).json({
            success: true,
            message: 'Student registration successful',
            userId: newStudent._id.toString(),
            email: newStudent.email,
        });
    } catch (error) {
        console.error('Registration error:', error);
        AuditLogger.log('STUDENT_REGISTRATION', 'UNKNOWN', 'STUDENT', '/auth/student/register', 'FAILURE', {
            reason: error.message,
        });
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            code: 'REGISTRATION_ERROR'
        });
    }
});

// Student Login
app.post('/auth/student/login', rateLimitLogin, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required',
                code: 'VALIDATION_ERROR'
            });
        }

        const user = await Student.findOne({ username });

        if (!user || !user.isActive) {
            AuditLogger.log('LOGIN_ATTEMPT', username, 'STUDENT', '/auth/student/login', 'FAILURE', {
                reason: 'User not found or inactive',
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password',
                code: 'AUTH_FAILED'
            });
        }

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
            AuditLogger.log('LOGIN_ATTEMPT', user._id.toString(), 'STUDENT', '/auth/student/login', 'FAILURE', {
                reason: 'Account locked',
            });
            return res.status(429).json({
                success: false,
                message: 'Account temporarily locked. Try again later.',
                code: 'ACCOUNT_LOCKED'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            // Increment failed attempts
            user.loginAttempts = (user.loginAttempts || 0) + 1;
            if (user.loginAttempts >= 5) {
                user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // Lock for 15 minutes
            }
            await user.save();

            AuditLogger.log('LOGIN_ATTEMPT', user._id.toString(), 'STUDENT', '/auth/student/login', 'FAILURE', {
                reason: 'Invalid password',
                attempts: user.loginAttempts,
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password',
                code: 'AUTH_FAILED'
            });
        }

        // Reset login attempts on successful login
        user.lastLogin = new Date();
        user.loginAttempts = 0;
        user.lockedUntil = null;
        await user.save();

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user._id.toString(), 'STUDENT', user.email);
        clearLoginAttempts(username);

        AuditLogger.log('LOGIN_SUCCESS', user._id.toString(), 'STUDENT', '/auth/student/login', 'SUCCESS', {
            email: user.email,
        });

        res.json({
            success: true,
            message: 'Student login successful',
            accessToken,
            refreshToken,
            user: {
                userId: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                department: user.department,
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            code: 'LOGIN_ERROR'
        });
    }
});

// Admin Registration (Protected - Only SUPERADMIN can create new admins)
app.post('/auth/admin/register', authenticate, authorize('SUPERADMIN'), rateLimitLogin, async (req, res) => {
    try {
        const { name, email, phone, position, username, password, role } = req.body;

        if (!name || !email || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, username, and password are required',
                code: 'VALIDATION_ERROR'
            });
        }

        const existingAdmin = await Admin.findOne({ $or: [{ username }, { email }] });
        if (existingAdmin) {
            return res.status(400).json({
                success: false,
                message: 'Username or email already registered',
                code: 'USER_EXISTS'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newAdmin = new Admin({
            name,
            email,
            phone,
            position,
            username,
            password: hashedPassword,
            role: role || 'ADMIN',
            isActive: true,
        });

        await newAdmin.save();

        AuditLogger.log('ADMIN_REGISTRATION', newAdmin._id.toString(), 'ADMIN', '/auth/admin/register', 'SUCCESS', {
            email: newAdmin.email,
            createdBy: req.user.userId,
        });

        res.status(201).json({
            success: true,
            message: 'Admin registered successfully',
            userId: newAdmin._id.toString(),
            email: newAdmin.email,
        });
    } catch (error) {
        console.error('Admin registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Admin registration failed',
            code: 'REGISTRATION_ERROR'
        });
    }
});

// Admin Login
app.post('/auth/admin/login', rateLimitLogin, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required',
                code: 'VALIDATION_ERROR'
            });
        }

        const admin = await Admin.findOne({ username });

        if (!admin || !admin.isActive) {
            AuditLogger.log('LOGIN_ATTEMPT', username, 'ADMIN', '/auth/admin/login', 'FAILURE', {
                reason: 'Admin not found or inactive',
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password',
                code: 'AUTH_FAILED'
            });
        }

        // Check if account is locked
        if (admin.lockedUntil && admin.lockedUntil > new Date()) {
            return res.status(429).json({
                success: false,
                message: 'Account temporarily locked',
                code: 'ACCOUNT_LOCKED'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);

        if (!isPasswordValid) {
            admin.loginAttempts = (admin.loginAttempts || 0) + 1;
            if (admin.loginAttempts >= 5) {
                admin.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            }
            await admin.save();

            AuditLogger.log('LOGIN_ATTEMPT', admin._id.toString(), 'ADMIN', '/auth/admin/login', 'FAILURE', {
                reason: 'Invalid password',
                attempts: admin.loginAttempts,
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password',
                code: 'AUTH_FAILED'
            });
        }

        admin.lastLogin = new Date();
        admin.loginAttempts = 0;
        admin.lockedUntil = null;
        await admin.save();

        const { accessToken, refreshToken } = generateTokens(admin._id.toString(), admin.role, admin.email);
        clearLoginAttempts(username);

        AuditLogger.log('LOGIN_SUCCESS', admin._id.toString(), admin.role, '/auth/admin/login', 'SUCCESS', {
            email: admin.email,
        });

        res.json({
            success: true,
            message: 'Admin login successful',
            accessToken,
            refreshToken,
            user: {
                userId: admin._id.toString(),
                name: admin.name,
                email: admin.email,
                role: admin.role,
                position: admin.position,
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            code: 'LOGIN_ERROR'
        });
    }
});

// Company Registration
app.post('/auth/company/register', rateLimitLogin, async (req, res) => {
    try {
        const { name, email, company_add, phone, username, password } = req.body;

        if (!name || !email || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, username, and password are required',
                code: 'VALIDATION_ERROR'
            });
        }

        const existingCompany = await Company.findOne({ $or: [{ username }, { email }] });
        if (existingCompany) {
            return res.status(400).json({
                success: false,
                message: 'Username or email already registered',
                code: 'USER_EXISTS'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newCompany = new Company({
            name,
            email,
            company_add,
            phone,
            username,
            password: hashedPassword,
            role: 'COMPANY',
            isActive: true,
        });

        await newCompany.save();

        AuditLogger.log('COMPANY_REGISTRATION', newCompany._id.toString(), 'COMPANY', '/auth/company/register', 'SUCCESS', {
            email: newCompany.email,
            username: newCompany.username,
        });

        res.status(201).json({
            success: true,
            message: 'Company registration successful',
            userId: newCompany._id.toString(),
            email: newCompany.email,
        });
    } catch (error) {
        console.error('Company registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed',
            code: 'REGISTRATION_ERROR'
        });
    }
});

// Company Login
app.post('/auth/company/login', rateLimitLogin, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required',
                code: 'VALIDATION_ERROR'
            });
        }

        const company = await Company.findOne({ username });

        if (!company || !company.isActive) {
            AuditLogger.log('LOGIN_ATTEMPT', username, 'COMPANY', '/auth/company/login', 'FAILURE', {
                reason: 'Company not found or inactive',
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password',
                code: 'AUTH_FAILED'
            });
        }

        if (company.lockedUntil && company.lockedUntil > new Date()) {
            return res.status(429).json({
                success: false,
                message: 'Account temporarily locked',
                code: 'ACCOUNT_LOCKED'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, company.password);

        if (!isPasswordValid) {
            company.loginAttempts = (company.loginAttempts || 0) + 1;
            if (company.loginAttempts >= 5) {
                company.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            }
            await company.save();

            AuditLogger.log('LOGIN_ATTEMPT', company._id.toString(), 'COMPANY', '/auth/company/login', 'FAILURE', {
                reason: 'Invalid password',
                attempts: company.loginAttempts,
            });
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password',
                code: 'AUTH_FAILED'
            });
        }

        company.lastLogin = new Date();
        company.loginAttempts = 0;
        company.lockedUntil = null;
        await company.save();

        const { accessToken, refreshToken } = generateTokens(company._id.toString(), 'COMPANY', company.email);
        clearLoginAttempts(username);

        AuditLogger.log('LOGIN_SUCCESS', company._id.toString(), 'COMPANY', '/auth/company/login', 'SUCCESS', {
            email: company.email,
        });

        res.json({
            success: true,
            message: 'Company login successful',
            accessToken,
            refreshToken,
            user: {
                userId: company._id.toString(),
                name: company.name,
                email: company.email,
                role: 'COMPANY',
            }
        });
    } catch (error) {
        console.error('Company login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed',
            code: 'LOGIN_ERROR'
        });
    }
});

/**
 * ANNOUNCEMENT ENDPOINTS - WITH RBAC
 */

// Get all announcements (Public - no auth required)
app.get('/announcements', cacheMiddleware(CACHE_KEYS.ANNOUNCEMENTS_ALL, TTL.MEDIUM), async (req, res) => {
    try {
        const announcements = await Announcement.find({ isPublished: true }).sort({ createdAt: -1 });
        res.json({
            success: true,
            announcements,
        });
    } catch (error) {
        console.error('Error fetching announcements:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching announcements',
            code: 'FETCH_ERROR'
        });
    }
});

// Create announcement (Admin or Company only)
app.post('/announcements', authenticate, authorize('ADMIN', 'COMPANY'), requirePermission('create_announcements'), invalidateCacheMiddleware([CACHE_KEYS.ANNOUNCEMENTS_ALL]), async (req, res) => {
    try {
        const { title, content } = req.body;

        if (!title || !content) {
            return res.status(400).json({
                success: false,
                message: 'Title and content are required',
                code: 'VALIDATION_ERROR'
            });
        }

        const announcement = new Announcement({
            title,
            content,
            createdBy: req.user.userId,
            creatorRole: req.user.role,
            isPublished: true,
        });

        await announcement.save();

        AuditLogger.log('ANNOUNCEMENT_CREATED', req.user.userId, req.user.role, '/announcements', 'SUCCESS', {
            announcementId: announcement._id.toString(),
        });

        res.status(201).json({
            success: true,
            message: 'Announcement created successfully',
            announcement,
        });
    } catch (error) {
        console.error('Error creating announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating announcement',
            code: 'CREATE_ERROR'
        });
    }
});

// Update announcement (Creator or Admin only)
app.put('/announcements/:id', authenticate, invalidateCacheMiddleware([CACHE_KEYS.ANNOUNCEMENTS_ALL]), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content } = req.body;

        const announcement = await Announcement.findById(id);

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found',
                code: 'NOT_FOUND'
            });
        }

        // Check authorization
        const isCreator = announcement.createdBy === req.user.userId;
        const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN';

        if (!isCreator && !isAdmin) {
            AuditLogger.log('UPDATE_ANNOUNCEMENT', req.user.userId, req.user.role, `/announcements/${id}`, 'DENIED', {
                reason: 'Not creator or admin',
            });
            return res.status(403).json({
                success: false,
                message: 'You can only update your own announcements',
                code: 'FORBIDDEN'
            });
        }

        announcement.title = title || announcement.title;
        announcement.content = content || announcement.content;
        announcement.updatedAt = new Date();
        await announcement.save();

        AuditLogger.log('ANNOUNCEMENT_UPDATED', req.user.userId, req.user.role, `/announcements/${id}`, 'SUCCESS');

        res.json({
            success: true,
            message: 'Announcement updated successfully',
            announcement,
        });
    } catch (error) {
        console.error('Error updating announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating announcement',
            code: 'UPDATE_ERROR'
        });
    }
});

// Delete announcement (Creator or Admin only)
app.delete('/announcements/:id', authenticate, invalidateCacheMiddleware([CACHE_KEYS.ANNOUNCEMENTS_ALL]), async (req, res) => {
    try {
        const { id } = req.params;

        const announcement = await Announcement.findById(id);

        if (!announcement) {
            return res.status(404).json({
                success: false,
                message: 'Announcement not found',
                code: 'NOT_FOUND'
            });
        }

        // Check authorization
        const isCreator = announcement.createdBy === req.user.userId;
        const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN';

        if (!isCreator && !isAdmin) {
            AuditLogger.log('DELETE_ANNOUNCEMENT', req.user.userId, req.user.role, `/announcements/${id}`, 'DENIED', {
                reason: 'Not creator or admin',
            });
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own announcements',
                code: 'FORBIDDEN'
            });
        }

        await Announcement.findByIdAndDelete(id);

        AuditLogger.log('ANNOUNCEMENT_DELETED', req.user.userId, req.user.role, `/announcements/${id}`, 'SUCCESS');

        res.json({
            success: true,
            message: 'Announcement deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting announcement:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting announcement',
            code: 'DELETE_ERROR'
        });
    }
});

/**
 * USER PROFILE ENDPOINTS - WITH RBAC
 */

// Get own profile
app.get('/auth/profile', authenticate, async (req, res) => {
    try {
        let user;

        if (req.user.role === 'STUDENT') {
            user = await Student.findById(req.user.userId).select('-password');
        } else if (req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN') {
            user = await Admin.findById(req.user.userId).select('-password');
        } else if (req.user.role === 'COMPANY') {
            user = await Company.findById(req.user.userId).select('-password');
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
                code: 'USER_NOT_FOUND'
            });
        }

        res.json({
            success: true,
            user,
        });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile',
            code: 'FETCH_ERROR'
        });
    }
});

// Update own profile
app.put('/auth/profile', authenticate, invalidateCacheMiddleware([CACHE_KEYS.STUDENT + 'all']), async (req, res) => {
    try {
        const { name, email, phone, gender } = req.body;
        let user;

        if (req.user.role === 'STUDENT') {
            user = await Student.findByIdAndUpdate(
                req.user.userId,
                { name, email, phone, gender, updatedAt: new Date() },
                { new: true }
            ).select('-password');
        } else if (req.user.role === 'COMPANY') {
            user = await Company.findByIdAndUpdate(
                req.user.userId,
                { name, email, phone, updatedAt: new Date() },
                { new: true }
            ).select('-password');
        } else if (req.user.role === 'ADMIN' || req.user.role === 'SUPERADMIN') {
            user = await Admin.findByIdAndUpdate(
                req.user.userId,
                { name, email, phone, updatedAt: new Date() },
                { new: true }
            ).select('-password');
        }

        AuditLogger.log('PROFILE_UPDATED', req.user.userId, req.user.role, '/auth/profile', 'SUCCESS');

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user,
        });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile',
            code: 'UPDATE_ERROR'
        });
    }
});

/**
 * ADMIN MANAGEMENT ENDPOINTS
 */

// Get all students (Admin only)
app.get('/admin/students', authenticate, authorize('ADMIN', 'SUPERADMIN'), requirePermission('view_all_profiles'), cacheMiddleware(CACHE_KEYS.STUDENT + 'all', TTL.MEDIUM), async (req, res) => {
    try {
        const students = await Student.find().select('-password');
        res.json({
            success: true,
            count: students.length,
            students,
        });
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching students',
            code: 'FETCH_ERROR'
        });
    }
});

// Get student count
app.get('/admin/students/count', authenticate, authorize('ADMIN', 'SUPERADMIN'), requirePermission('view_all_profiles'), cacheMiddleware('students:count', TTL.SHORT), async (req, res) => {
    try {
        const count = await Student.countDocuments({ isActive: true });
        res.json({
            success: true,
            count,
        });
    } catch (error) {
        console.error('Error fetching student count:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching student count',
            code: 'FETCH_ERROR'
        });
    }
});

// Delete student (Admin only)
app.delete('/admin/students/:userId', authenticate, authorize('ADMIN', 'SUPERADMIN'), requirePermission('delete_users'), invalidateCacheMiddleware([CACHE_KEYS.STUDENT + 'all', 'students:count']), async (req, res) => {
    try {
        const { userId } = req.params;

        const student = await Student.findByIdAndUpdate(
            userId,
            { isActive: false, updatedAt: new Date() },
            { new: true }
        ).select('-password');

        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found',
                code: 'USER_NOT_FOUND'
            });
        }

        AuditLogger.log('STUDENT_DELETED', userId, 'STUDENT', `/admin/students/${userId}`, 'SUCCESS', {
            deletedBy: req.user.userId,
        });

        res.json({
            success: true,
            message: 'Student deactivated successfully',
            student,
        });
    } catch (error) {
        console.error('Error deleting student:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting student',
            code: 'DELETE_ERROR'
        });
    }
});

// Get audit logs (Admin/Superadmin only)
app.get('/admin/audit-logs', authenticate, authorize('ADMIN', 'SUPERADMIN'), requirePermission('view_audit_logs'), async (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const logsPath = path.join(__dirname, 'logs', 'audit.log');

        if (!fs.existsSync(logsPath)) {
            return res.json({
                success: true,
                message: 'No audit logs available',
                logs: [],
            });
        }

        const logs = fs.readFileSync(logsPath, 'utf-8')
            .split('\n')
            .filter(line => line.trim())
            .slice(-100) // Last 100 logs
            .map(line => JSON.parse(line));

        res.json({
            success: true,
            count: logs.length,
            logs,
        });
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching audit logs',
            code: 'FETCH_ERROR'
        });
    }
});

/**
 * START SERVER
 */
app.listen(port, '127.0.0.1', () => {
    console.log(`🚀 Server running with RBAC support on http://127.0.0.1:${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
