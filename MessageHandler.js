require('./Enums.js');

//Class to handle message from client
function MessageHandler(server, socket) 
{
    this.server = server;
    this.socket = socket;
}

module.exports = MessageHandler;

MessageHandler.prototype.handleMessage = function(message)
{
    if (message.length == 0) return;
	var buffer = new Buffer(message);
	var messageId = buffer.readUIntLE(0, 1);
	
	switch (messageId) 
	{
		//Send score from client
		case MessageIdEnum.SEND_SCORE:
			console.log("SEND_SCORE");
			
			var nameLength = buffer.readUIntLE(1, 1);
			var name = buffer.slice(2, nameLength + 2).toString();
			var score = buffer.readUIntLE(nameLength + 2, 4);
			
			this.server.sendScore(this.socket, name, score);
			break;
			
		//Leaderboard request from client
		case MessageIdEnum.REQUEST_LEADERBOARD:
			console.log("REQUEST_LEADERBOARD");
			
			var count = buffer.readUIntLE(1, 4);
			this.server.requestLeaderboard(this.socket, count);
			break;
			
		//Highscore request from client
		case MessageIdEnum.REQUEST_SCORE:
			console.log("REQUEST_SCORE");
			
			var nameLength = buffer.readUIntLE(1, 1);
			var name = buffer.slice(2, nameLength + 2).toString();
			
			this.server.requestScore(this.socket, name);
			break;			
				
		default:
			break;
    }
};
