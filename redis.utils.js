const redisClient = require('./redis.config');

/**
 * Cache key patterns for different data types
 */
const CACHE_KEYS = {
    ANNOUNCEMENT: 'announcement:',
    ANNOUNCEMENTS_ALL: 'announcements:all',
    STUDENT: 'student:',
    ADMIN: 'admin:',
    COMPANY: 'company:',
    SESSION: 'session:',
    USER_PROFILE: 'user:profile:',
};

/**
 * Default TTL values (in seconds)
 */
const TTL = {
    SHORT: 60 * 5,        // 5 minutes
    MEDIUM: 60 * 30,      // 30 minutes
    LONG: 60 * 60 * 24,   // 24 hours
};

/**
 * Get value from Redis cache
 * @param {string} key - Cache key
 * @returns {Promise<any>} - Cached value or null
 */
const getCache = (key) => {
    return new Promise((resolve, reject) => {
        redisClient.get(key, (err, data) => {
            if (err) {
                console.error(`Cache GET error for key ${key}:`, err);
                reject(err);
            } else {
                try {
                    resolve(data ? JSON.parse(data) : null);
                } catch (parseErr) {
                    console.error(`Cache parse error for key ${key}:`, parseErr);
                    resolve(data); // Return raw data if JSON parse fails
                }
            }
        });
    });
};

/**
 * Set value in Redis cache
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttl - Time to live in seconds (default: MEDIUM)
 * @returns {Promise<boolean>}
 */
const setCache = (key, value, ttl = TTL.MEDIUM) => {
    return new Promise((resolve, reject) => {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        redisClient.setex(key, ttl, serialized, (err, reply) => {
            if (err) {
                console.error(`Cache SET error for key ${key}:`, err);
                reject(err);
            } else {
                resolve(reply === 'OK');
            }
        });
    });
};

/**
 * Delete value from Redis cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>}
 */
const deleteCache = (key) => {
    return new Promise((resolve, reject) => {
        redisClient.del(key, (err, reply) => {
            if (err) {
                console.error(`Cache DELETE error for key ${key}:`, err);
                reject(err);
            } else {
                resolve(reply === 1);
            }
        });
    });
};

/**
 * Delete multiple cache keys by pattern
 * @param {string} pattern - Key pattern (e.g., 'user:*')
 * @returns {Promise<number>} - Number of keys deleted
 */
const deleteCachePattern = (pattern) => {
    return new Promise((resolve, reject) => {
        redisClient.keys(pattern, (err, keys) => {
            if (err) {
                console.error(`Cache KEYS error for pattern ${pattern}:`, err);
                reject(err);
            } else if (keys.length === 0) {
                resolve(0);
            } else {
                redisClient.del(...keys, (delErr, reply) => {
                    if (delErr) {
                        console.error(`Cache DEL error for pattern ${pattern}:`, delErr);
                        reject(delErr);
                    } else {
                        resolve(reply);
                    }
                });
            }
        });
    });
};

/**
 * Check if key exists in cache
 * @param {string} key - Cache key
 * @returns {Promise<boolean>}
 */
const cacheExists = (key) => {
    return new Promise((resolve, reject) => {
        redisClient.exists(key, (err, reply) => {
            if (err) {
                console.error(`Cache EXISTS error for key ${key}:`, err);
                reject(err);
            } else {
                resolve(reply === 1);
            }
        });
    });
};

/**
 * Increment counter in cache
 * @param {string} key - Cache key
 * @param {number} increment - Amount to increment (default: 1)
 * @returns {Promise<number>} - New value
 */
const incrementCache = (key, increment = 1) => {
    return new Promise((resolve, reject) => {
        redisClient.incrby(key, increment, (err, reply) => {
            if (err) {
                console.error(`Cache INCR error for key ${key}:`, err);
                reject(err);
            } else {
                resolve(reply);
            }
        });
    });
};

/**
 * Get TTL of a cache key
 * @param {string} key - Cache key
 * @returns {Promise<number>} - TTL in seconds (-2 if key doesn't exist, -1 if no expiry)
 */
const getCacheTTL = (key) => {
    return new Promise((resolve, reject) => {
        redisClient.ttl(key, (err, reply) => {
            if (err) {
                console.error(`Cache TTL error for key ${key}:`, err);
                reject(err);
            } else {
                resolve(reply);
            }
        });
    });
};

/**
 * Clear all cache
 * @returns {Promise<boolean>}
 */
const clearAllCache = () => {
    return new Promise((resolve, reject) => {
        redisClient.flushdb((err, reply) => {
            if (err) {
                console.error('Cache FLUSHDB error:', err);
                reject(err);
            } else {
                console.log('✓ All cache cleared');
                resolve(reply === 'OK');
            }
        });
    });
};

module.exports = {
    CACHE_KEYS,
    TTL,
    getCache,
    setCache,
    deleteCache,
    deleteCachePattern,
    cacheExists,
    incrementCache,
    getCacheTTL,
    clearAllCache,
};
