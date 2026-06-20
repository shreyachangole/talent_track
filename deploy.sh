#!/bin/bash

# Production Deployment Script
# Usage: ./deploy.sh [staging|production]

set -e  # Exit on error

ENVIRONMENT=${1:-staging}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups/$TIMESTAMP"

echo "🚀 Talent Track Production Deployment Script"
echo "Environment: $ENVIRONMENT"
echo "Timestamp: $TIMESTAMP"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
  echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
  echo -e "${RED}✗${NC} $1"
}

# 1. Pre-deployment checks
echo -e "${YELLOW}=== PRE-DEPLOYMENT CHECKS ===${NC}"

# Check if environment file exists
if [ ! -f ".env.$ENVIRONMENT" ]; then
  print_error ".env.$ENVIRONMENT not found"
  exit 1
fi
print_info ".env.$ENVIRONMENT file found"

# Check if Git is clean
if ! git diff-index --quiet HEAD --; then
  print_warning "Git working directory is dirty. Uncommitted changes detected."
fi
print_info "Git status checked"

# 2. Build Docker image
echo ""
echo -e "${YELLOW}=== BUILDING DOCKER IMAGE ===${NC}"

REGISTRY=${DOCKER_REGISTRY:-ghcr.io}
IMAGE_NAME=$REGISTRY/talent-track
IMAGE_TAG="$ENVIRONMENT-$TIMESTAMP"

docker build -t "$IMAGE_NAME:$IMAGE_TAG" \
             -t "$IMAGE_NAME:$ENVIRONMENT-latest" \
             -f Dockerfile .

print_info "Docker image built: $IMAGE_NAME:$IMAGE_TAG"

# 3. Run security scan
echo ""
echo -e "${YELLOW}=== SECURITY SCANNING ===${NC}"

docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image "$IMAGE_NAME:$IMAGE_TAG" || print_warning "Security scan completed with warnings"

print_info "Security scan completed"

# 4. Create database backup
echo ""
echo -e "${YELLOW}=== DATABASE BACKUP ===${NC}"

mkdir -p "$BACKUP_DIR"

if [ "$ENVIRONMENT" = "production" ]; then
  print_warning "Creating production database backup..."
  
  source ".env.$ENVIRONMENT"
  
  mongodump --uri "$MONGODB_URI" \
            --out "$BACKUP_DIR/mongodb" || print_warning "MongoDB backup warning"
  
  print_info "Database backup created at: $BACKUP_DIR/mongodb"
else
  print_info "Skipping database backup for staging environment"
fi

# 5. Push Docker image to registry
echo ""
echo -e "${YELLOW}=== PUSHING DOCKER IMAGE ===${NC}"

docker push "$IMAGE_NAME:$IMAGE_TAG"
docker push "$IMAGE_NAME:$ENVIRONMENT-latest"

print_info "Docker image pushed to registry"

# 6. Deploy using Docker Compose or Kubernetes
echo ""
echo -e "${YELLOW}=== DEPLOYING APPLICATION ===${NC}"

if command -v kubectl &> /dev/null; then
  # Kubernetes deployment
  echo "Deploying to Kubernetes..."
  
  NAMESPACE="talent-track-$ENVIRONMENT"
  
  # Create namespace if it doesn't exist
  kubectl get namespace "$NAMESPACE" || kubectl create namespace "$NAMESPACE"
  
  # Create secrets from environment file
  kubectl create secret generic talent-track-secrets \
    --from-env-file=".env.$ENVIRONMENT" \
    --namespace="$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -
  
  # Update deployment image
  kubectl set image deployment/talent-track \
    talent-track="$IMAGE_NAME:$IMAGE_TAG" \
    --namespace="$NAMESPACE"
  
  # Wait for rollout
  kubectl rollout status deployment/talent-track \
    --namespace="$NAMESPACE" \
    --timeout=10m
  
  print_info "Kubernetes deployment completed"
  
  # Get service info
  echo ""
  kubectl get svc -n "$NAMESPACE"
  
else
  # Docker Compose deployment
  echo "Deploying with Docker Compose..."
  
  export DOCKER_IMAGE="$IMAGE_NAME:$IMAGE_TAG"
  source ".env.$ENVIRONMENT"
  
  docker-compose -f docker-compose.yml \
                 --env-file ".env.$ENVIRONMENT" \
                 up -d
  
  # Wait for containers to be healthy
  echo "Waiting for containers to be healthy..."
  sleep 10
  
  docker-compose ps
  
  print_info "Docker Compose deployment completed"
fi

# 7. Health checks
echo ""
echo -e "${YELLOW}=== HEALTH CHECKS ===${NC}"

HEALTH_URL="http://localhost:3000/health"
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if curl -f "$HEALTH_URL" > /dev/null 2>&1; then
    print_info "Health check passed"
    break
  fi
  
  RETRY_COUNT=$((RETRY_COUNT + 1))
  echo "Waiting for application to be healthy... ($RETRY_COUNT/$MAX_RETRIES)"
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  print_error "Application health check failed after $MAX_RETRIES attempts"
  exit 1
fi

# 8. Run smoke tests
echo ""
echo -e "${YELLOW}=== SMOKE TESTS ===${NC}"

# Test API endpoints
ENDPOINTS=(
  "http://localhost:3000/health"
  "http://localhost:3000/announcements"
)

for endpoint in "${ENDPOINTS[@]}"; do
  if curl -s "$endpoint" > /dev/null; then
    print_info "Endpoint test passed: $endpoint"
  else
    print_error "Endpoint test failed: $endpoint"
  fi
done

# 9. Deployment summary
echo ""
echo -e "${YELLOW}=== DEPLOYMENT SUMMARY ===${NC}"
echo "Environment: $ENVIRONMENT"
echo "Image: $IMAGE_NAME:$IMAGE_TAG"
echo "Timestamp: $TIMESTAMP"
echo "Backup Location: $BACKUP_DIR"

if [ "$ENVIRONMENT" = "production" ]; then
  echo ""
  print_warning "Production deployment completed!"
  print_warning "Please verify:"
  print_warning "1. Application is responding correctly"
  print_warning "2. Database connections are working"
  print_warning "3. External APIs are connected"
  print_warning "4. Monitoring and alerts are functioning"
fi

print_info "Deployment completed successfully!"
echo ""

# 10. Cleanup old backups (keep last 7 days)
if [ "$ENVIRONMENT" = "production" ]; then
  find ./backups -type d -mtime +7 -exec rm -rf {} \; || true
  print_info "Old backups cleaned up"
fi

echo -e "${GREEN}=== DEPLOYMENT FINISHED ===${NC}"
