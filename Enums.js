//Type of messages (should be the same for both client and server)
global.MessageIdEnum = Object.freeze({
	"SEND_SCORE":0, 
	"NOTIFY_SCORE":1, 
	"REQUEST_LEADERBOARD":2, 
	"REPLY_LEADERBOARD":3,
	"REQUEST_SCORE":4, 
	"REPLY_SCORE":5 
})
