# Production Deployment Guide - Enterprise Grade

This guide covers production-ready deployment across multiple cloud platforms following AWS best practices.

## 📋 Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Docker Deployment](#docker-deployment)
4. [AWS Deployment](#aws-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [Monitoring & Logging](#monitoring--logging)
7. [Backup & Recovery](#backup--recovery)
8. [Security Hardening](#security-hardening)
9. [Scaling & Performance](#scaling--performance)
10. [Troubleshooting](#troubleshooting)

---

## Pre-Deployment Checklist

### Infrastructure Requirements
- [ ] Domain name configured with DNS
- [ ] SSL/TLS certificates acquired (Let's Encrypt or AWS ACM)
- [ ] Database backups configured
- [ ] CDN setup (CloudFront, Cloudflare)
- [ ] WAF (Web Application Firewall) enabled
- [ ] DDoS protection configured
- [ ] Monitoring and alerting setup
- [ ] Log aggregation configured
- [ ] Secrets management system ready
- [ ] CI/CD pipeline tested

### Security Requirements
- [ ] All secrets moved to environment variables / secrets manager
- [ ] JWT_SECRET changed to strong random value
- [ ] JWT_REFRESH_SECRET changed to strong random value
- [ ] Database credentials secured
- [ ] API keys for external services secured
- [ ] CORS restricted to known domains only
- [ ] Rate limiting enabled
- [ ] HTTPS/TLS enforced
- [ ] Security headers configured
- [ ] Admin accounts created with strong passwords

### Documentation Requirements
- [ ] Architecture diagram documented
- [ ] Runbook created for common issues
- [ ] On-call procedures documented
- [ ] Rollback procedures tested
- [ ] Disaster recovery plan created
- [ ] API documentation updated
- [ ] Deployment process documented

---

## Environment Configuration

### Generate Secure Secrets

```bash
# Generate strong random keys
JWT_SECRET=$(openssl rand -base64 32)
JWT_REFRESH_SECRET=$(openssl rand -base64 32)
MONGODB_PASSWORD=$(openssl rand -base64 24)
REDIS_PASSWORD=$(openssl rand -base64 24)

echo "JWT_SECRET=$JWT_SECRET"
echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
echo "MONGODB_PASSWORD=$MONGODB_PASSWORD"
echo "REDIS_PASSWORD=$REDIS_PASSWORD"
```

### Production .env File

```bash
# Core Configuration
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# JWT
JWT_SECRET=<generated-secret>
JWT_REFRESH_SECRET=<generated-refresh-secret>

# Database
MONGODB_ROOT_USER=admin
MONGODB_ROOT_PASSWORD=<generated-password>
MONGODB_URI=mongodb://admin:<password>@mongodb-host:27017/studentDB?authSource=admin&ssl=true

# Redis
REDIS_HOST=redis-host
REDIS_PORT=6379
REDIS_PASSWORD=<generated-password>

# Security
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
HTTPS_ENABLED=true

# External APIs
GOOGLE_GEMINI_API_KEY=<your-api-key>
OPENAI_API_KEY=<your-api-key>

# Monitoring
SENTRY_DSN=<sentry-dsn>
DATADOG_API_KEY=<datadog-key>

# Alerts
SLACK_WEBHOOK_URL=<webhook-url>
ALERT_EMAIL=ops@yourdomain.com
```

---

## Docker Deployment

### Build & Push to Registry

```bash
# Set registry
REGISTRY=your-registry.com
IMAGE_NAME=talent-track
TAG=$(date +%Y%m%d-%H%M%S)

# Build image
docker build -t $REGISTRY/$IMAGE_NAME:$TAG \
             -t $REGISTRY/$IMAGE_NAME:latest .

# Push to registry
docker push $REGISTRY/$IMAGE_NAME:$TAG
docker push $REGISTRY/$IMAGE_NAME:latest

# Verify
docker inspect $REGISTRY/$IMAGE_NAME:$TAG
```

### Docker Compose Production Deployment

```bash
# Pull latest images
docker-compose pull

# Run services
docker-compose -f docker-compose.yml up -d

# Verify all services are healthy
docker-compose ps

# Check logs
docker-compose logs -f app

# Backup database before any updates
docker exec talent-track-mongodb mongodump --out /backup/$(date +%Y%m%d_%H%M%S)
```

---

## AWS Deployment

### Using AWS ECS (Elastic Container Service)

#### 1. Create ECR Repository

```bash
aws ecr create-repository \
  --repository-name talent-track \
  --region us-east-1
```

#### 2. Push Image to ECR

```bash
# Get login token
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Tag image
docker tag talent-track:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/talent-track:latest

# Push
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/talent-track:latest
```

#### 3. Create ECS Cluster

```bash
aws ecs create-cluster --cluster-name talent-track-cluster
```

#### 4. Create Task Definition

```bash
aws ecs register-task-definition \
  --family talent-track-app \
  --network-mode awsvpc \
  --requires-compatibilities FARGATE \
  --cpu 512 \
  --memory 1024 \
  --container-definitions '[
    {
      "name": "talent-track-app",
      "image": "<account-id>.dkr.ecr.us-east-1.amazonaws.com/talent-track:latest",
      "portMappings": [{"containerPort": 3000, "hostPort": 3000, "protocol": "tcp"}],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "3000"}
      ],
      "secrets": [
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:us-east-1:<account-id>:secret:jwt-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/talent-track",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]'
```

#### 5. Create ECS Service

```bash
aws ecs create-service \
  --cluster talent-track-cluster \
  --service-name talent-track-service \
  --task-definition talent-track-app \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}"
```

#### 6. Setup Auto Scaling

```bash
# Create scaling target
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/talent-track-cluster/talent-track-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10

# Create scaling policy (CPU-based)
aws application-autoscaling put-scaling-policy \
  --policy-name talent-track-cpu-scaling \
  --service-namespace ecs \
  --resource-id service/talent-track-cluster/talent-track-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration '{
    "TargetValue": 70.0,
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
    }
  }'
```

### Using AWS RDS for MongoDB

```bash
# Create RDS DocumentDB (MongoDB-compatible)
aws docdb create-db-cluster \
  --db-cluster-identifier talent-track-cluster \
  --engine docdb \
  --master-username admin \
  --master-user-password <strong-password> \
  --backup-retention-period 30 \
  --preferred-backup-window "03:00-04:00" \
  --storage-encrypted

# Create instance
aws docdb create-db-instance \
  --db-instance-identifier talent-track-instance-1 \
  --db-cluster-identifier talent-track-cluster \
  --db-instance-class db.r5.large
```

### Using AWS ElastiCache for Redis

```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id talent-track-redis \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --num-cache-nodes 1 \
  --engine-version 7.0 \
  --port 6379 \
  --security-group-ids sg-xxx
```

---

## Kubernetes Deployment

### Create Namespace

```bash
kubectl create namespace talent-track-prod
```

### Create Secrets

```bash
kubectl create secret generic talent-track-secrets \
  --from-literal=JWT_SECRET=<secret> \
  --from-literal=JWT_REFRESH_SECRET=<secret> \
  --from-literal=MONGODB_PASSWORD=<password> \
  --from-literal=REDIS_PASSWORD=<password> \
  -n talent-track-prod
```

### Deploy Application

```bash
kubectl apply -f k8s/deployment.yaml -n talent-track-prod
kubectl apply -f k8s/service.yaml -n talent-track-prod
kubectl apply -f k8s/ingress.yaml -n talent-track-prod
kubectl apply -f k8s/hpa.yaml -n talent-track-prod
```

### Verify Deployment

```bash
kubectl get pods -n talent-track-prod
kubectl get svc -n talent-track-prod
kubectl logs -f deployment/talent-track -n talent-track-prod
```

---

## Monitoring & Logging

### CloudWatch Logs (AWS)

```bash
# Create log group
aws logs create-log-group --log-group-name /talent-track/app

# Set retention
aws logs put-retention-policy \
  --log-group-name /talent-track/app \
  --retention-in-days 30
```

### Application Performance Monitoring

```bash
# Send metrics to Datadog
npm install datadog-browser-rum

# In application
window.DD_RUM.init({
  applicationId: '<app-id>',
  clientToken: '<client-token>',
  site: 'datadoghq.com',
  service: 'talent-track',
  env: 'production',
  sessionSampleRate: 100,
  sessionReplaySampleRate: 20
});

window.DD_RUM.startSessionReplayRecording();
```

### Error Tracking with Sentry

```bash
npm install @sentry/node @sentry/tracing

// In server.js
const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
// ... routes ...
app.use(Sentry.Handlers.errorHandler());
```

---

## Backup & Recovery

### Automated Database Backups

```bash
# Daily backup at 2 AM UTC
0 2 * * * mongodump --out /backups/$(date +\%Y\%m\%d)

# Upload to S3
0 3 * * * aws s3 sync /backups s3://talent-track-backups/
```

### Point-in-Time Recovery

```bash
# Restore from specific backup
mongorestore --drop /backups/20240620
```

### Test Backups Regularly

```bash
# Schedule monthly restore test
0 0 1 * * /scripts/restore-test.sh
```

---

## Security Hardening

### Network Security

- [ ] Enable VPC with private subnets
- [ ] Use security groups to restrict traffic
- [ ] Enable VPC Flow Logs
- [ ] Implement WAF rules
- [ ] Use AWS Shield Standard (automatic)
- [ ] Consider AWS Shield Advanced for DDoS

### Application Security

- [ ] Enable CORS properly
- [ ] Implement rate limiting
- [ ] Add request signing
- [ ] Use HTTPS only
- [ ] Implement CSP headers
- [ ] Enable HSTS
- [ ] Implement input validation

### Data Security

- [ ] Encrypt data at rest (RDS, ElastiCache)
- [ ] Encrypt data in transit (TLS)
- [ ] Use AWS KMS for key management
- [ ] Enable database authentication
- [ ] Implement database encryption
- [ ] Regular security audits

---

## Scaling & Performance

### Horizontal Scaling

```bash
# AWS Auto Scaling
aws application-autoscaling put-scaling-policy \
  --policy-name talent-track-scaling \
  --service-namespace ecs \
  --resource-id service/talent-track-cluster/talent-track-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration file://scaling-config.json
```

### Database Performance

```bash
# MongoDB Performance Indexes
db.students.createIndex({ email: 1 })
db.students.createIndex({ username: 1 })
db.announcements.createIndex({ createdAt: -1 })

# Redis Key Expiration
redis-cli EXPIRE announcements 3600
```

### CDN Configuration (CloudFront)

```bash
aws cloudfront create-distribution \
  --origin-domain-name talent-track.example.com \
  --default-root-object index.html
```

---

## Troubleshooting

### Common Issues & Solutions

**Issue: High CPU Usage**
```bash
# Check running processes
docker top talent-track-app

# Check Node.js memory
node --max-old-space-size=1024 server-rbac.js

# Profile with clinic
npm install clinic
clinic doctor -- node server-rbac.js
```

**Issue: Database Connection Timeouts**
```bash
# Check MongoDB connectivity
mongosh "mongodb://user:pass@host:27017/studentDB"

# Check connection pool
db.serverStatus().connections
```

**Issue: Redis Memory Issues**
```bash
# Check Redis info
redis-cli INFO memory

# Clear expired keys
redis-cli FLUSHDB
```

---

## Production Runbook

### Daily Tasks
- [ ] Review error logs
- [ ] Check system metrics
- [ ] Verify backups completed
- [ ] Monitor API response times

### Weekly Tasks
- [ ] Review security logs
- [ ] Analyze user growth
- [ ] Test disaster recovery
- [ ] Review cost optimization

### Monthly Tasks
- [ ] Full security audit
- [ ] Performance analysis
- [ ] Capacity planning review
- [ ] Compliance check

---

**Last Updated:** 2024-06-20  
**Version:** 1.0.0  
**Status:** Production Ready
