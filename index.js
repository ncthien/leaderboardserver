var LeaderboardServer = require('./LeaderboardServer');

console.log("Start Leaderboard Server");

var server = new LeaderboardServer();
server.start();