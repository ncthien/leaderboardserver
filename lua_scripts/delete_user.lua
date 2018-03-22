local leaderboardName = KEYS[1]
local name = KEYS[2]

local countInfoName = "C|" .. name
redis.call("DEL", countInfoName);

return redis.call("ZREM", leaderboardName, name);