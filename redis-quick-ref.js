#!/usr/bin/env node

/**
 * Redis Quick Reference for talent_track
 * Run this to see cache stats and available commands
 */

const redisClient = require('./redis.config');
const { getCache, setCache, deleteCache, clearAllCache, CACHE_KEYS, TTL } = require('./redis.utils');

// Color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
};

const log = {
    section: (title) => console.log(`\n${colors.bright}${colors.blue}➤ ${title}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
    info: (msg) => console.log(`${colors.yellow}ℹ ${msg}${colors.reset}`),
    code: (code) => console.log(`${colors.yellow}  ${code}${colors.reset}`),
};

async function showRedisInfo() {
    return new Promise((resolve) => {
        redisClient.info((err, info) => {
            if (err) {
                log.error('Could not fetch Redis info');
                resolve();
            } else {
                const lines = info.split('\r\n').filter(line => line.trim());
                lines.forEach(line => {
                    if (line.includes(':') && !line.startsWith('#')) {
                        const [key, value] = line.split(':');
                        console.log(`  ${colors.yellow}${key}${colors.reset}: ${value}`);
                    }
                });
                resolve();
            }
        });
    });
}

async function listCacheKeys() {
    return new Promise((resolve) => {
        redisClient.keys('*', (err, keys) => {
            if (err) {
                log.error('Could not fetch cache keys');
                resolve([]);
            } else {
                resolve(keys || []);
            }
        });
    });
}

async function getCacheSize(key) {
    return new Promise((resolve) => {
        redisClient.strlen(key, (err, size) => {
            resolve(err ? 0 : size);
        });
    });
}

async function main() {
    console.clear();
    
    log.section('REDIS QUICK REFERENCE - talent_track');
    
    // Check connection
    redisClient.ping((err, reply) => {
        if (err) {
            log.error('Redis connection failed!');
            log.info('Make sure Redis is running: redis-server');
            log.info('Or use Docker: docker run -d -p 6379:6379 redis:latest');
            process.exit(1);
        }
        
        log.success('Connected to Redis');
    });
    
    // Show available cache keys
    log.section('CACHE KEYS REFERENCE');
    console.log('  Standard Key Patterns:');
    log.code(`CACHE_KEYS.ANNOUNCEMENT       = '${CACHE_KEYS.ANNOUNCEMENT}'`);
    log.code(`CACHE_KEYS.ANNOUNCEMENTS_ALL  = '${CACHE_KEYS.ANNOUNCEMENTS_ALL}'`);
    log.code(`CACHE_KEYS.STUDENT            = '${CACHE_KEYS.STUDENT}'`);
    log.code(`CACHE_KEYS.ADMIN              = '${CACHE_KEYS.ADMIN}'`);
    log.code(`CACHE_KEYS.COMPANY            = '${CACHE_KEYS.COMPANY}'`);
    log.code(`CACHE_KEYS.SESSION            = '${CACHE_KEYS.SESSION}'`);
    log.code(`CACHE_KEYS.USER_PROFILE       = '${CACHE_KEYS.USER_PROFILE}'`);
    
    // Show TTL options
    log.section('TTL OPTIONS');
    console.log('  Time To Live Presets:');
    log.code(`TTL.SHORT   = ${TTL.SHORT}s     (5 minutes)`);
    log.code(`TTL.MEDIUM  = ${TTL.MEDIUM}s    (30 minutes)`);
    log.code(`TTL.LONG    = ${TTL.LONG}s   (24 hours)`);
    
    // Show common operations
    log.section('COMMON OPERATIONS');
    console.log('\n  Get Cached Data:');
    log.code('const data = await getCache("announcements:all");');
    
    console.log('\n  Set Cache:');
    log.code('await setCache("key", data, TTL.MEDIUM);');
    
    console.log('\n  Delete Cache:');
    log.code('await deleteCache("announcements:all");');
    
    console.log('\n  Clear All Cache:');
    log.code('await clearAllCache();');
    
    // Show cached endpoints
    log.section('CACHED ENDPOINTS IN SERVER');
    console.log('\n  GET Endpoints (Cached):');
    log.code('GET /announcements          → 30 min cache');
    log.code('GET /admin/profile          → 24 hrs cache');
    log.code('GET /students/count         → 5 min cache');
    log.code('GET /students               → 30 min cache');
    
    console.log('\n  Cache Invalidation (on success):');
    log.code('POST /announcements         → clears announcements');
    log.code('DELETE /announcements/:id   → clears announcements');
    log.code('DELETE /students/:username  → clears students + count');
    log.code('PUT /students/:username     → clears students + count');
    
    // Show Redis CLI commands
    log.section('USEFUL REDIS CLI COMMANDS');
    console.log('\n  Connect to Redis:');
    log.code('redis-cli');
    
    console.log('\n  View all cache keys:');
    log.code('redis-cli KEYS "*"');
    
    console.log('\n  Get specific key:');
    log.code('redis-cli GET key_name');
    
    console.log('\n  View cache statistics:');
    log.code('redis-cli INFO stats');
    
    console.log('\n  Monitor live commands:');
    log.code('redis-cli MONITOR');
    
    console.log('\n  Get memory usage:');
    log.code('redis-cli INFO memory');
    
    console.log('\n  Clear all cache:');
    log.code('redis-cli FLUSHALL');
    
    console.log('\n  Check key TTL:');
    log.code('redis-cli TTL key_name');
    
    // Show setup instructions
    log.section('SETUP INSTRUCTIONS');
    
    console.log('\n  1. Install Dependencies:');
    log.code('npm install');
    
    console.log('\n  2. Start Redis (Docker - Recommended):');
    log.code('docker run -d -p 6379:6379 redis:latest');
    
    console.log('\n  3. Or start Redis locally:');
    log.code('redis-server');
    
    console.log('\n  4. Start Application:');
    log.code('npm start');
    
    // Show performance benefits
    log.section('PERFORMANCE IMPROVEMENTS');
    console.log('\n  Expected Response Time Reductions:');
    log.code('Announcements GET      50-70% faster');
    log.code('Student Count GET      90%+ faster');
    log.code('Admin Profile GET      60-80% faster');
    log.code('Students List GET      40-60% faster');
    
    // Show advanced patterns
    log.section('ADVANCED PATTERNS AVAILABLE');
    console.log('\n  See redis.advanced-patterns.js for:');
    log.code('• Rate Limiting          → prevent API abuse');
    log.code('• Session Management     → user sessions');
    log.code('• Leaderboards           → rankings');
    log.code('• Analytics              → real-time stats');
    log.code('• Job Queues             → background jobs');
    log.code('• Bloom Filters          → existence checks');
    log.code('• Pub/Sub                → real-time messages');
    log.code('• Distributed Locks      → prevent race conditions');
    log.code('• Geospatial             → location queries');
    log.code('• HyperLogLog            → unique visitor counting');
    
    // Show documentation references
    log.section('DOCUMENTATION');
    console.log('\n  Complete Guides:');
    log.code('• REDIS_GUIDE.md               - Full documentation');
    log.code('• REDIS_IMPLEMENTATION.md      - Implementation details');
    log.code('• redis.advanced-patterns.js   - Advanced examples');
    
    console.log('\n  External Resources:');
    log.code('• https://redis.io/documentation');
    log.code('• https://redis.io/docs/manual/client-side-caching/');
    
    // Try to show current cache status
    log.section('CURRENT CACHE STATUS');
    
    setTimeout(async () => {
        const keys = await listCacheKeys();
        
        if (keys.length === 0) {
            log.info('No cache entries yet. Start the server and make requests!');
        } else {
            console.log(`\n  Total Cached Keys: ${colors.green}${keys.length}${colors.reset}\n`);
            
            for (const key of keys) {
                redisClient.ttl(key, async (err, ttl) => {
                    const size = await getCacheSize(key);
                    const ttlStr = ttl === -1 ? 'no expiry' : ttl === -2 ? 'expired' : `${ttl}s`;
                    console.log(`  ${colors.yellow}${key}${colors.reset} (${size} bytes, TTL: ${ttlStr})`);
                });
            }
        }
        
        console.log('\n' + '='.repeat(60) + '\n');
        log.success('Redis integration is ready to use!');
        log.info('Run "npm start" to begin caching requests\n');
        
        process.exit(0);
    }, 500);
}

// Run if executed directly
if (require.main === module) {
    main().catch(err => {
        log.error('Error: ' + err.message);
        process.exit(1);
    });
}

module.exports = { log, showRedisInfo, listCacheKeys };
