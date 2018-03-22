local leaderboardName = KEYS[1]
local name = KEYS[2]
local score = tonumber(KEYS[3])
local logTime = tonumber(KEYS[4])

local nameLength = string.len(name)

-- get current highscore of the user
local oldScoreStr = redis.call("ZSCORE", leaderboardName, name)

local oldScore = 0
if oldScoreStr ~= false then 
	oldScore = tonumber(oldScoreStr) 
end

-- only allow highscore to be record
if score > oldScore then
	-- update score for user in leaderboard
	redis.call("ZADD", leaderboardName, score, name)
	local countInfoName = "C|" .. name
	
	-- increase highscore update counter of the user
	redis.call("INCR", countInfoName)
	
	-- log highscore update event
	local leaderboardLogName = "L|" .. leaderboardName
	redis.call("ZADD", leaderboardLogName, logTime, name .. "|" .. tostring(score))
	
	-- publish the highscore update event
	redis.call("PUBLISH", leaderboardName, struct.pack("Bc0I4I4", nameLength, name, score, oldScore)); 
	
	return score
else
	return false
end