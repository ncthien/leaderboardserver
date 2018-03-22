local leaderboardName = KEYS[1]
local name = KEYS[2]
local score = tonumber(KEYS[3])
local logTime = tonumber(KEYS[4])

local nameLength = string.len(name)

local oldScoreStr = redis.call("ZSCORE", leaderboardName, name)

local oldScore = 0
if oldScoreStr ~= false then 
	oldScore = tonumber(oldScoreStr) 
end

if score > oldScore then
	redis.call("ZADD", leaderboardName, score, name)
	local countInfoName = "C|" .. name
	redis.call("INCR", countInfoName)
	
	local leaderboardLogName = "L|" .. leaderboardName
	redis.call("ZADD", leaderboardLogName, logTime, name .. "|" .. tostring(score))
	
	redis.call("PUBLISH", leaderboardName, struct.pack("Bc0I4I4", nameLength, name, score, oldScore)); 
	
	return score
else
	return false
end