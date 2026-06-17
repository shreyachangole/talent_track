const redis = require('redis');

// Create Redis client
const redisClient = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    // password: process.env.REDIS_PASSWORD, // Uncomment if Redis requires authentication
    // db: 0, // Default database
    retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
            console.error('Redis connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
            return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
            return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
    }
});

// Handle Redis events
redisClient.on('connect', () => {
    console.log('✓ Redis client connected');
});

redisClient.on('ready', () => {
    console.log('✓ Redis client ready');
});

redisClient.on('error', (err) => {
    console.error('✗ Redis client error:', err.message);
});

redisClient.on('end', () => {
    console.log('✗ Redis client connection ended');
});

module.exports = redisClient;
