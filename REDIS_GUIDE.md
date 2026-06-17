# Redis Integration Guide

This document explains how Redis is integrated into your talent_track application for caching and performance optimization.

## Files Overview

### 1. `redis.config.js` - Redis Connection Setup
Handles Redis client initialization with:
- Connection pooling and retry strategy
- Error handling
- Event listeners (connect, ready, error, end)
- Configurable host/port via environment variables

**Usage:**
```javascript
const redisClient = require('./redis.config');
```

### 2. `redis.utils.js` - Cache Operations
Provides core cache functions:

#### Available Functions

**`getCache(key)`** - Retrieve cached data
```javascript
const data = await getCache('announcement:all');
```

**`setCache(key, value, ttl)`** - Store data in cache
```javascript
await setCache('announcement:1', announcementData, TTL.MEDIUM);
```

**`deleteCache(key)`** - Remove specific cache entry
```javascript
await deleteCache('announcement:all');
```

**`deleteCachePattern(pattern)`** - Remove multiple entries by pattern
```javascript
await deleteCachePattern('user:*'); // Deletes all user cache entries
```

**`cacheExists(key)`** - Check if key exists
```javascript
const exists = await cacheExists('announcement:1');
```

**`incrementCache(key, amount)`** - Increment counter
```javascript
await incrementCache('view:count:123', 1);
```

**`getCacheTTL(key)`** - Get remaining TTL of a key
```javascript
const ttl = await getCacheTTL('announcement:all');
```

**`clearAllCache()`** - Clear all cache (use with caution!)
```javascript
await clearAllCache();
```

#### Cache Key Patterns
Standardized cache keys for different data types:
```javascript
CACHE_KEYS.ANNOUNCEMENT        // 'announcement:'
CACHE_KEYS.ANNOUNCEMENTS_ALL   // 'announcements:all'
CACHE_KEYS.STUDENT             // 'student:'
CACHE_KEYS.ADMIN               // 'admin:'
CACHE_KEYS.COMPANY             // 'company:'
CACHE_KEYS.SESSION             // 'session:'
CACHE_KEYS.USER_PROFILE        // 'user:profile:'
```

#### TTL (Time To Live) Constants
```javascript
TTL.SHORT   // 5 minutes  (300 seconds)
TTL.MEDIUM  // 30 minutes (1800 seconds)
TTL.LONG    // 24 hours   (86400 seconds)
```

### 3. `redis.middleware.js` - Cache Middleware
Provides Express middleware for automatic cache management:

#### `cacheMiddleware(key, ttl)` - Automatic Response Caching
```javascript
app.get('/announcements', 
  cacheMiddleware(CACHE_KEYS.ANNOUNCEMENTS_ALL, TTL.MEDIUM), 
  handler
);
```
- Checks cache before executing route handler
- If cache hit: returns cached data immediately
- If cache miss: executes handler and caches response

#### `conditionalCacheMiddleware(cacheKeyFn, ttl)` - Dynamic Cache Keys
```javascript
app.get('/admin/profile',
  conditionalCacheMiddleware(
    (req) => CACHE_KEYS.ADMIN + req.query.username,
    TTL.LONG
  ),
  handler
);
```
- Uses function to generate cache key from request
- Useful for parameterized endpoints

#### `invalidateCacheMiddleware(cacheKeys)` - Cache Invalidation
```javascript
app.post('/announcements',
  invalidateCacheMiddleware([CACHE_KEYS.ANNOUNCEMENTS_ALL]),
  handler
);
```
- Automatically clears specified cache on successful response
- Supports pattern-based deletion (e.g., `'user:*'`)
- Only invalidates on 2xx status codes

## Current Implementation in server.js

### Cached GET Endpoints
```
GET /announcements          → cached as 'announcements:all'
GET /admin/profile          → cached as 'admin:{username}'
GET /students/count         → cached as 'students:count'
GET /students               → cached as 'student:all'
```

### Cache Invalidation on Modifications
```
POST /announcements         → clears 'announcements:all'
DELETE /announcements/:id   → clears 'announcements:all'
POST /company/announcements → clears 'announcements:all'
DELETE /students/:username  → clears 'student:all' and 'students:count'
PUT /students/:username     → clears 'student:all' and 'students:count'
```

## Setup Instructions

### 1. Install Redis on Your System

**Windows (using WSL2 or Docker):**
```bash
# Using Docker (recommended)
docker run -d -p 6379:6379 redis:latest

# Or install Redis directly
# Download from: https://github.com/microsoftarchive/redis/releases
```

**Linux:**
```bash
sudo apt-get install redis-server
redis-server
```

**macOS:**
```bash
brew install redis
brew services start redis
```

### 2. Install Node Dependencies
```bash
npm install
```

### 3. Configure Environment Variables (Optional)
Create a `.env` file:
```env
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=your_password  # If Redis requires authentication
```

### 4. Start Redis Server
```bash
redis-server
```

### 5. Start Your Application
```bash
npm start
```

## Monitoring Redis Cache

### Using Redis CLI

```bash
# Connect to Redis
redis-cli

# View all keys
KEYS *

# Get specific key
GET announcement:all

# View cache statistics
INFO stats

# Monitor real-time commands
MONITOR

# View memory usage
INFO memory

# Clear all cache
FLUSHALL

# Exit
EXIT
```

### Redis Cache Diagnostics

Add this route to your server.js for cache diagnostics:

```javascript
// Cache diagnostics endpoint (for development only)
app.get('/cache/stats', async (req, res) => {
    try {
        redisClient.info('stats', (err, info) => {
            if (err) {
                return res.status(500).json({ error: err });
            }
            redisClient.dbsize((dbErr, size) => {
                if (dbErr) {
                    return res.status(500).json({ error: dbErr });
                }
                res.json({
                    info: info,
                    cacheSize: size
                });
            });
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clear cache endpoint (for development only)
app.post('/cache/clear', async (req, res) => {
    try {
        await clearAllCache();
        res.json({ message: 'Cache cleared successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
```

## Performance Benefits

1. **Reduced Database Queries** - Frequently accessed data served from memory
2. **Lower Latency** - Redis responds in milliseconds vs MongoDB's disk I/O
3. **Reduced Server Load** - Less CPU/memory usage on application server
4. **Scalability** - Handle more concurrent requests with same resources
5. **Better User Experience** - Faster API responses

## Expected Performance Improvements

- **Announcements endpoint**: 50-70% faster response time
- **Student count**: 90%+ faster (simple count operation)
- **Admin profile**: 60-80% faster response time

## Best Practices

1. **Cache Invalidation** - Always invalidate dependent caches when data changes
2. **TTL Strategy** - Use appropriate TTLs based on data freshness requirements
3. **Key Naming** - Use consistent, hierarchical key patterns
4. **Error Handling** - Cache failures shouldn't break the application
5. **Memory Management** - Monitor Redis memory usage and set eviction policies
6. **Monitoring** - Log cache hits/misses for debugging

## Common Issues and Solutions

### Redis Connection Refused
```
Error: ECONNREFUSED
Solution: Ensure Redis server is running on localhost:6379
```

### Cache Not Being Cleared
```
Issue: Old data still being served after update
Solution: Check if invalidateCacheMiddleware is applied to modification routes
```

### High Memory Usage
```
Issue: Redis memory keeps growing
Solution: Set maxmemory and eviction policy in redis.conf
```

### Cache Middleware Errors
```
Issue: "Cannot get property of undefined"
Solution: Cache middleware handles errors gracefully, falls back to executing handler
```

## Integration with Other Features

### For Aptitude Tests (CodingPract)
Add caching for frequently accessed quiz questions:
```javascript
const { setCache, getCache, CACHE_KEYS, TTL } = require('./redis.utils');

// Cache quiz questions
app.get('/quiz/:id', async (req, res) => {
    const cached = await getCache(`quiz:${req.params.id}`);
    if (cached) return res.json(cached);
    
    // Fetch from DB and cache
    const quiz = await getQuizFromDB(req.params.id);
    await setCache(`quiz:${req.params.id}`, quiz, TTL.LONG);
    res.json(quiz);
});
```

### For Mock Interviews (MockInter)
Cache interview schedules and candidate profiles:
```javascript
const cacheKey = `interview:${interviewId}`;
await setCache(cacheKey, interviewData, TTL.MEDIUM);
```

## Next Steps

1. Monitor cache hit/miss ratios
2. Adjust TTL values based on actual usage patterns
3. Add caching to Python backend applications if needed
4. Implement cache warming for critical data
5. Set up Redis persistence (RDB/AOF) for production

---

**For more info on Redis, visit:** https://redis.io/documentation
