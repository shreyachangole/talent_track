const { getCache, setCache, CACHE_KEYS, TTL } = require('./redis.utils');

/**
 * Cache middleware for GET requests
 * Usage: app.get('/route', cacheMiddleware('cache-key', TTL.MEDIUM), handler)
 */
const cacheMiddleware = (cacheKey, ttl = TTL.MEDIUM) => {
    return async (req, res, next) => {
        try {
            // Check if data exists in cache
            const cachedData = await getCache(cacheKey);
            
            if (cachedData) {
                console.log(`✓ Cache HIT for key: ${cacheKey}`);
                return res.json(cachedData);
            }
            
            console.log(`✗ Cache MISS for key: ${cacheKey}`);
            
            // Store original res.json to intercept response
            const originalJson = res.json.bind(res);
            
            res.json = function(data) {
                // Cache the response
                setCache(cacheKey, data, ttl).catch(err => {
                    console.error(`Failed to cache data for key ${cacheKey}:`, err);
                });
                return originalJson(data);
            };
            
            next();
        } catch (error) {
            console.error('Cache middleware error:', error);
            // Continue to next middleware if cache fails
            next();
        }
    };
};

/**
 * Conditional cache middleware - uses query params or custom logic
 * Usage: app.get('/route', conditionalCacheMiddleware(cacheKeyFn), handler)
 */
const conditionalCacheMiddleware = (cacheKeyFn, ttl = TTL.MEDIUM) => {
    return async (req, res, next) => {
        try {
            const cacheKey = typeof cacheKeyFn === 'function' ? cacheKeyFn(req) : cacheKeyFn;
            
            if (!cacheKey) {
                return next(); // Skip caching if no cache key
            }
            
            const cachedData = await getCache(cacheKey);
            
            if (cachedData) {
                console.log(`✓ Cache HIT for key: ${cacheKey}`);
                return res.json(cachedData);
            }
            
            console.log(`✗ Cache MISS for key: ${cacheKey}`);
            
            const originalJson = res.json.bind(res);
            
            res.json = function(data) {
                setCache(cacheKey, data, ttl).catch(err => {
                    console.error(`Failed to cache data for key ${cacheKey}:`, err);
                });
                return originalJson(data);
            };
            
            next();
        } catch (error) {
            console.error('Conditional cache middleware error:', error);
            next();
        }
    };
};

/**
 * Invalidate cache on POST/PUT/DELETE requests
 * Usage: app.post('/route', invalidateCacheMiddleware(['cache-key-1', 'cache-key-*']), handler)
 */
const invalidateCacheMiddleware = (cacheKeys = []) => {
    return async (req, res, next) => {
        // Store original res.json
        const originalJson = res.json.bind(res);
        
        res.json = function(data) {
            // If response is successful (2xx), invalidate cache
            if (res.statusCode >= 200 && res.statusCode < 300) {
                Promise.all(
                    cacheKeys.map(key => {
                        if (key.includes('*')) {
                            // Pattern-based deletion
                            const { deleteCachePattern } = require('./redis.utils');
                            return deleteCachePattern(key);
                        } else {
                            // Single key deletion
                            const { deleteCache } = require('./redis.utils');
                            return deleteCache(key);
                        }
                    })
                ).catch(err => {
                    console.error('Cache invalidation error:', err);
                });
            }
            return originalJson(data);
        };
        
        next();
    };
};

module.exports = {
    cacheMiddleware,
    conditionalCacheMiddleware,
    invalidateCacheMiddleware,
};
