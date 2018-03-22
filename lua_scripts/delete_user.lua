local leaderboardName = KEYS[1]
local name = KEYS[2]

-- delete highscore update counter of the user
local countInfoName = "C|" .. name
redis.call("DEL", countInfoName);

-- remove user from leaderboard
return redis.call("ZREM", leaderboardName, name);