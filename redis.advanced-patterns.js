// Advanced Redis Patterns for talent_track
// These patterns can be implemented for enhanced functionality

/**
 * 1. RATE LIMITING - Prevent API abuse
 */
const rateLimitPattern = async (userId, limit = 100, windowSeconds = 60) => {
    const { incrementCache, CACHE_KEYS, setCache } = require('./redis.utils');
    const key = `rate-limit:${userId}`;
    
    const count = await incrementCache(key, 1);
    if (count === 1) {
        await setCache(key, 1, windowSeconds);
    }
    
    return count <= limit;
};

/**
 * 2. SESSION MANAGEMENT - Store user sessions with expiry
 */
const createSessionPattern = async (userId, sessionData) => {
    const { setCache, CACHE_KEYS, TTL } = require('./redis.utils');
    const sessionKey = `session:${userId}:${Date.now()}`;
    
    await setCache(sessionKey, {
        userId,
        ...sessionData,
        createdAt: new Date(),
    }, TTL.LONG);
    
    return sessionKey;
};

/**
 * 3. LEADERBOARD - Store and retrieve rankings
 */
const leaderboardPattern = async (redisClient) => {
    return {
        addScore: (userId, score) => {
            return new Promise((resolve, reject) => {
                redisClient.zadd('leaderboard:scores', score, userId, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        },
        
        getTopScores: (count = 10) => {
            return new Promise((resolve, reject) => {
                redisClient.zrevrange('leaderboard:scores', 0, count - 1, 'WITHSCORES', (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        },
        
        getUserRank: (userId) => {
            return new Promise((resolve, reject) => {
                redisClient.zrevrank('leaderboard:scores', userId, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply !== null ? reply + 1 : null);
                });
            });
        }
    };
};

/**
 * 4. COUNTER/ANALYTICS - Track metrics in real-time
 */
const analyticsPattern = (redisClient) => {
    return {
        incrementView: (contentId) => {
            return new Promise((resolve, reject) => {
                redisClient.incr(`views:${contentId}`, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        },
        
        getViewCount: (contentId) => {
            return new Promise((resolve, reject) => {
                redisClient.get(`views:${contentId}`, (err, reply) => {
                    if (err) reject(err);
                    else resolve(parseInt(reply) || 0);
                });
            });
        },
        
        trackEvent: (eventType, userId, metadata = {}) => {
            const key = `event:${eventType}:${new Date().toISOString().split('T')[0]}`;
            return new Promise((resolve, reject) => {
                redisClient.hincrby(key, userId, 1, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        }
    };
};

/**
 * 5. QUEUE/BACKGROUND JOBS - Store job processing queues
 */
const jobQueuePattern = (redisClient) => {
    return {
        addJob: (queueName, jobData) => {
            return new Promise((resolve, reject) => {
                redisClient.lpush(`queue:${queueName}`, JSON.stringify(jobData), (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        },
        
        getJob: (queueName) => {
            return new Promise((resolve, reject) => {
                redisClient.rpop(`queue:${queueName}`, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply ? JSON.parse(reply) : null);
                });
            });
        },
        
        queueLength: (queueName) => {
            return new Promise((resolve, reject) => {
                redisClient.llen(`queue:${queueName}`, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        }
    };
};

/**
 * 6. BLOOM FILTER - Check if item likely exists (memory efficient)
 */
const bloomFilterPattern = (redisClient) => {
    return {
        add: (filterId, item) => {
            return new Promise((resolve, reject) => {
                const hash = require('crypto').createHash('md5').update(item).digest('hex');
                const bit = parseInt(hash.substring(0, 8), 16) % 1000;
                redisClient.setbit(`bloom:${filterId}`, bit, 1, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        },
        
        contains: (filterId, item) => {
            return new Promise((resolve, reject) => {
                const hash = require('crypto').createHash('md5').update(item).digest('hex');
                const bit = parseInt(hash.substring(0, 8), 16) % 1000;
                redisClient.getbit(`bloom:${filterId}`, bit, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply === 1);
                });
            });
        }
    };
};

/**
 * 7. PUB/SUB - Real-time message broadcasting
 */
const pubSubPattern = (redisClient) => {
    const subscriber = require('redis').createClient();
    
    return {
        subscribe: (channel, callback) => {
            subscriber.subscribe(channel);
            subscriber.on('message', (chan, message) => {
                if (chan === channel) {
                    callback(JSON.parse(message));
                }
            });
        },
        
        publish: (channel, message) => {
            return new Promise((resolve, reject) => {
                redisClient.publish(channel, JSON.stringify(message), (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        },
        
        unsubscribe: (channel) => {
            subscriber.unsubscribe(channel);
        }
    };
};

/**
 * 8. DISTRIBUTED LOCK - Prevent race conditions
 */
const distributedLockPattern = (redisClient) => {
    return {
        acquire: (lockKey, lockValue, ttl = 30) => {
            return new Promise((resolve, reject) => {
                redisClient.set(lockKey, lockValue, 'PX', ttl * 1000, 'NX', (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply === 'OK');
                });
            });
        },
        
        release: (lockKey, lockValue) => {
            return new Promise((resolve, reject) => {
                redisClient.get(lockKey, (err, currentValue) => {
                    if (err) {
                        reject(err);
                    } else if (currentValue === lockValue) {
                        redisClient.del(lockKey, (delErr, reply) => {
                            if (delErr) reject(delErr);
                            else resolve(reply === 1);
                        });
                    } else {
                        resolve(false);
                    }
                });
            });
        }
    };
};

/**
 * 9. GEOSPATIAL - Store and query locations (for job postings, companies)
 */
const geoSpatialPattern = (redisClient) => {
    return {
        addLocation: (geoKey, longitude, latitude, memberId) => {
            return new Promise((resolve, reject) => {
                redisClient.geoadd(geoKey, longitude, latitude, memberId, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        },
        
        findNearby: (geoKey, longitude, latitude, radiusKm = 10) => {
            return new Promise((resolve, reject) => {
                redisClient.georadius(
                    geoKey, longitude, latitude, radiusKm, 'km',
                    'WITHCOORD', 'WITHDIST',
                    (err, reply) => {
                        if (err) reject(err);
                        else resolve(reply);
                    }
                );
            });
        }
    };
};

/**
 * 10. HyperLogLog - Count unique visitors efficiently
 */
const hyperLogLogPattern = (redisClient) => {
    return {
        addVisitor: (pageKey, visitorId) => {
            return new Promise((resolve, reject) => {
                redisClient.pfadd(pageKey, visitorId, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        },
        
        countUniqueVisitors: (pageKey) => {
            return new Promise((resolve, reject) => {
                redisClient.pfcount(pageKey, (err, reply) => {
                    if (err) reject(err);
                    else resolve(reply);
                });
            });
        }
    };
};

// ============================================
// PRACTICAL USAGE EXAMPLES FOR talent_track
// ============================================

/**
 * Example 1: Rate limiting on registration to prevent bot spam
 */
// app.post('/register', async (req, res) => {
//     const { ip } = req;
//     const allowed = await rateLimitPattern(ip, 5, 3600); // 5 registrations per hour
//     
//     if (!allowed) {
//         return res.status(429).json({ message: 'Too many registration attempts' });
//     }
//     // Continue with registration...
// });

/**
 * Example 2: Leaderboard for aptitude test scores
 */
// const leaderboard = leaderboardPattern(redisClient);
// 
// // Add score after quiz completion
// app.post('/quiz/submit', async (req, res) => {
//     const { userId, score } = req.body;
//     await leaderboard.addScore(userId, score);
//     const rank = await leaderboard.getUserRank(userId);
//     res.json({ rank, score });
// });
// 
// // Get top performers
// app.get('/leaderboard/top', async (req, res) => {
//     const topScores = await leaderboard.getTopScores(10);
//     res.json(topScores);
// });

/**
 * Example 3: Track job postings by company
 */
// const analytics = analyticsPattern(redisClient);
// 
// app.post('/jobs/:jobId/view', async (req, res) => {
//     const views = await analytics.incrementView(req.params.jobId);
//     res.json({ views });
// });

/**
 * Example 4: Background job processing for resume parsing
 */
// const jobQueue = jobQueuePattern(redisClient);
// 
// app.post('/resume/upload', async (req, res) => {
//     const jobData = {
//         userId: req.body.userId,
//         resumePath: req.body.resumePath,
//         timestamp: new Date()
//     };
//     await jobQueue.addJob('resume-parsing', jobData);
//     res.json({ message: 'Resume queued for processing' });
// });

/**
 * Example 5: Real-time notifications with Pub/Sub
 */
// const pubSub = pubSubPattern(redisClient);
// 
// // On announcement creation
// app.post('/announcements', async (req, res) => {
//     const announcement = new Announcement(req.body);
//     await announcement.save();
//     
//     // Notify all subscribers
//     await pubSub.publish('announcements', {
//         type: 'new_announcement',
//         data: announcement
//     });
//     
//     res.json(announcement);
// });

module.exports = {
    rateLimitPattern,
    createSessionPattern,
    leaderboardPattern,
    analyticsPattern,
    jobQueuePattern,
    bloomFilterPattern,
    pubSubPattern,
    distributedLockPattern,
    geoSpatialPattern,
    hyperLogLogPattern,
};
