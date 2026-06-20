# Security Hardening Guide - Production Deployment

## 🔐 Overview

This guide covers comprehensive security hardening for the CareerConnects platform in production environments, following NIST and OWASP standards.

---

## 1. Application Security

### 1.1 Dependency Management

```bash
# Audit all dependencies
npm audit

# Fix vulnerabilities
npm audit fix

# Automated scanning in CI/CD
npm ci
npm audit --audit-level=moderate
```

### 1.2 Secrets Management

**❌ NEVER DO THIS:**
```javascript
// Bad: Secrets in code
const JWT_SECRET = "my-super-secret-key";
const API_KEY = "abc123xyz";
```

**✅ DO THIS INSTEAD:**
```javascript
// Good: Use environment variables
const JWT_SECRET = process.env.JWT_SECRET;
const API_KEY = process.env.API_KEY;
```

**AWS Secrets Manager:**
```bash
# Store secret
aws secretsmanager create-secret \
  --name talent-track/jwt-secret \
  --secret-string "your-secret-key"

# Retrieve in application
const AWS = require('aws-sdk');
const client = new AWS.SecretsManager();
const secret = await client.getSecretValue({
  SecretId: 'talent-track/jwt-secret'
}).promise();
```

### 1.3 OWASP Top 10 Mitigation

#### 1. Injection (SQL/NoSQL/Command)
```javascript
// ❌ VULNERABLE
app.get('/users/:id', (req, res) => {
  db.query(`SELECT * FROM users WHERE id = ${req.params.id}`);
});

// ✅ SAFE - Use parameterized queries
app.get('/users/:id', (req, res) => {
  db.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
});
```

#### 2. Broken Authentication
```javascript
// Already implemented in rbac.middleware.js:
// ✅ JWT-based authentication
// ✅ Token expiration (15 min)
// ✅ Refresh token rotation (7 days)
// ✅ Password hashing (bcrypt)
// ✅ Account lockout (5 attempts, 15 min)
```

#### 3. Sensitive Data Exposure
```javascript
// ✅ Always use HTTPS
// ✅ Encrypt data at rest
// ✅ Never log sensitive data

// Bad: Logging sensitive data
console.log('User password:', user.password);

// Good: Only log necessary info
console.log('User authenticated:', user.email);
```

#### 4. XML External Entities (XXE)
```javascript
// Disable XML parsers
const xml2js = require('xml2js');
const parser = new xml2js.Parser({
  strict: true,
  resolveNonEmptyNodes: false
});
```

#### 5. Broken Access Control
```javascript
// ✅ Implemented via RBAC middleware
authenticate → authorize → requirePermission
```

#### 6. Security Misconfiguration
```javascript
// ✅ Use helmet.js for security headers
const helmet = require('helmet');
app.use(helmet());

// ✅ Disable unnecessary headers
app.disable('x-powered-by');
app.disable('server');
```

#### 7. Cross-Site Scripting (XSS)
```javascript
// ✅ Sanitize user input
const sanitizeHtml = require('sanitize-html');
const cleanContent = sanitizeHtml(req.body.content);

// ✅ Set CSP header (via helmet)
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"]
  }
}));
```

#### 8. Insecure Deserialization
```javascript
// ❌ NEVER use eval() or unserialize()
eval(userInput);  // DANGEROUS!

// ✅ Use safe JSON parsing
JSON.parse(userInput);
```

#### 9. Using Components with Known Vulnerabilities
```bash
# Regular dependency updates
npm update
npm audit fix

# Pin versions in package.json
npm shrinkwrap  # Creates npm-shrinkwrap.json with locked versions
```

#### 10. Insufficient Logging & Monitoring
```javascript
// ✅ Comprehensive audit logging
const { AuditLogger } = require('./rbac.middleware');

AuditLogger.log('LOGIN_ATTEMPT', userId, role, '/auth/login', 'SUCCESS', {
  email: user.email,
  timestamp: new Date().toISOString(),
  ipAddress: req.ip
});
```

---

## 2. Network Security

### 2.1 HTTPS/TLS Configuration

**Force HTTPS only:**
```javascript
const helmet = require('helmet');
app.use(helmet.hsts({
  maxAge: 31536000,
  includeSubDomains: true,
  preload: true
}));
```

**SSL/TLS Setup (Let's Encrypt):**
```bash
# Using Certbot
certbot certonly --standalone -d yourdomain.com

# Auto-renewal
certbot renew --quiet && systemctl reload nginx
```

### 2.2 CORS Configuration

```javascript
const cors = require('cors');

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

### 2.3 Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

// General rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 100,  // 100 requests per windowMs
  skip: (req) => req.user?.role === 'ADMIN'
});

// Strict rate limiting for login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true
});

app.use(limiter);
app.post('/auth/*/login', loginLimiter, ...);
```

### 2.4 WAF Configuration (AWS)

```bash
# Create Web ACL in AWS WAF
aws wafv2 create-web-acl \
  --name talent-track-waf \
  --scope CLOUDFRONT \
  --default-action Block={} \
  --rules file://waf-rules.json
```

**WAF Rules (waf-rules.json):**
```json
{
  "Rules": [
    {
      "Name": "AWSManagedRulesCommonRuleSet",
      "Priority": 1,
      "OverrideAction": { "None": {} },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "AWSManagedRulesCommonRuleSetMetric"
      },
      "ManagedRuleGroupStatement": {
        "VendorName": "AWS",
        "Name": "AWSManagedRulesCommonRuleSet"
      }
    }
  ]
}
```

---

## 3. Data Security

### 3.1 Encryption at Rest

**MongoDB Encryption:**
```bash
# Enable encrypted storage
mongod --enableEncryption \
       --encryptionKeyFile /etc/mongodb.key \
       --encryptionCipherMode AES256-CBC
```

**Redis Encryption:**
```bash
# Enable TLS
redis-server --tls-port 6380 \
             --cert /etc/redis/cert.pem \
             --key /etc/redis/key.pem \
             --cacert /etc/redis/ca.pem
```

### 3.2 Encryption in Transit

```javascript
// All connections over HTTPS/TLS
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('/path/to/key.pem'),
  cert: fs.readFileSync('/path/to/cert.pem')
};

https.createServer(options, app).listen(443);
```

### 3.3 Database Authentication

**MongoDB Authentication:**
```bash
# Create admin user
mongosh admin
db.createUser({
  user: "admin",
  pwd: "strong-password",
  roles: ["root"]
})

# Enable authentication
mongod --auth
```

**Connection String:**
```bash
MONGODB_URI=mongodb://admin:password@mongodb-host:27017/studentDB?authSource=admin&ssl=true
```

---

## 4. Infrastructure Security

### 4.1 VPC & Network Isolation

**AWS VPC Setup:**
```bash
# Create VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16

# Create private subnet
aws ec2 create-subnet \
  --vpc-id vpc-xxx \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a

# Create security group
aws ec2 create-security-group \
  --group-name talent-track-sg \
  --description "Security group for Talent Track" \
  --vpc-id vpc-xxx
```

### 4.2 Security Groups

**Ingress Rules:**
```bash
# Allow HTTPS from anywhere
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0

# Allow SSH from admin IPs only
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxx \
  --protocol tcp \
  --port 22 \
  --cidr 203.0.113.0/32  # Your IP
```

**Egress Rules:**
```bash
# Default: deny all outbound
# Explicitly allow only necessary:
# - MongoDB (27017)
# - Redis (6379)
# - HTTPS (443)
# - DNS (53)
```

### 4.3 DDoS Protection

```bash
# AWS Shield Advanced
aws shield create-subscription

# AWS CloudFront for DDoS mitigation
aws cloudfront create-distribution \
  --origin-domain-name talent-track.example.com
```

---

## 5. Monitoring & Alerting

### 5.1 CloudWatch Monitoring

```javascript
// Send custom metrics
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

app.get('/api/endpoint', (req, res) => {
  const startTime = Date.now();
  
  // ... handle request ...
  
  const duration = Date.now() - startTime;
  cloudwatch.putMetricData({
    Namespace: 'TalentTrack',
    MetricData: [{
      MetricName: 'APILatency',
      Value: duration,
      Unit: 'Milliseconds',
      Timestamp: new Date()
    }]
  }, (err) => {
    if (err) console.error('CloudWatch error:', err);
  });
});
```

### 5.2 Security Alerts

```bash
# Alert on failed login attempts
aws cloudwatch put-metric-alarm \
  --alarm-name talent-track-failed-logins \
  --alarm-description "Alert on multiple failed logins" \
  --metric-name FailedLogins \
  --namespace TalentTrack \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:xxx:alert-topic
```

### 5.3 Log Aggregation

```javascript
// Using Winston logger
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL,
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.CloudWatch({
      logGroupName: '/talent-track/app',
      logStreamName: new Date().toISOString().split('T')[0],
      awsRegion: 'us-east-1'
    })
  ]
});
```

---

## 6. Compliance

### 6.1 GDPR Compliance

```javascript
// Right to be forgotten
app.delete('/api/user/:id/data', authenticate, async (req, res) => {
  // Delete user personal data
  await User.findByIdAndDelete(req.params.id);
  
  // Delete associated data
  await Assessment.deleteMany({ userId: req.params.id });
  
  // Log deletion for audit trail
  logger.info(`User ${req.params.id} data deleted at ${new Date()}`);
});

// Data portability
app.get('/api/user/:id/export', authenticate, async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(JSON.stringify(user, null, 2));
});
```

### 6.2 PCI DSS Compliance

- ✅ No credit card storage (use Stripe/PayPal)
- ✅ TLS 1.2 or higher
- ✅ Strong authentication
- ✅ Firewall configuration
- ✅ Regular vulnerability scans
- ✅ Intrusion detection

### 6.3 SOC 2 Compliance

- ✅ Access controls (RBAC)
- ✅ Encryption (at rest & in transit)
- ✅ Audit logging
- ✅ Incident response plan
- ✅ Business continuity plan
- ✅ Change management

---

## 7. Security Checklist

- [ ] All secrets in environment variables
- [ ] JWT secrets rotated regularly
- [ ] HTTPS enforced on all endpoints
- [ ] Rate limiting configured
- [ ] CORS properly restricted
- [ ] Security headers added (helmet.js)
- [ ] Dependencies regularly updated
- [ ] Vulnerability scanning in CI/CD
- [ ] Audit logging enabled
- [ ] Database authentication enabled
- [ ] Database backups encrypted
- [ ] VPC properly configured
- [ ] Security groups restricted
- [ ] WAF rules configured
- [ ] DDoS protection enabled
- [ ] Monitoring & alerting active
- [ ] Incident response plan documented
- [ ] Regular security audits scheduled
- [ ] Compliance requirements documented
- [ ] On-call procedures established

---

**Last Updated:** 2024-06-20  
**Version:** 1.0.0  
**Status:** Production Ready
