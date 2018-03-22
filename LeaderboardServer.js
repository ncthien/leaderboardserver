var WebSocket = require('ws');
var http = require('http');
var fs = require("fs");
var redis = require("redis");
var express = require('express');
var ini = require('./modules/ini.js');

var MessageHandler = require('./MessageHandler');

const leaderboardName = "leaderboard";

function LeaderboardServer() 
{
    this.isRunning = true;
	
	this.clients = [];

	this.config = {};
    this.loadConfig();

	this.luaScripts = {};
}

module.exports = LeaderboardServer;

LeaderboardServer.prototype.addLuaScript = function(name, hash)
{
	this.luaScripts[name] = hash;
	console.log("Add Lua script " + name + ":" + hash);
}

LeaderboardServer.prototype.start = function()
{
	this.app = express();
	
	var webServerPort = process.env.PORT || this.config.webServerPort;
	
	var server = this.app.listen(webServerPort, function()
	{
	  var port = server.address().port;
	  console.log("Web service listening at port %s", port);
	});
	
	this.app.get('/users/:userName/update_count', function(req, res)
	{
		var name = req.params.userName;
		this.countUserUpdate(name, function(err, reply)
			{
				if (err)
				{
					res.status(500).send(err);
				}
				else 
				{
					if (reply) res.send(reply);		
					else res.send("N/A");		
				}
			});
	}.bind(this));
	
	this.app.get('/update_log/:start-:end', function(req, res)
	{
		var startTime = parseInt(req.params.start);
		var endTime = parseInt(req.params.end);
		this.listUpdate(startTime, endTime, function(err, reply)
			{
				if (err)
				{
					res.status(500).send(err);
				}
				else 
				{
					var countMap = {};
					
					var len = reply.length;
					for (var i = 0; i < len; ++i)
					{
						var buf = reply[i];
						var name = buf.toString('utf8', 0, buf.lastIndexOf('|'));
						countMap[name] = (countMap[name] || 0) + 1;
					}

					res.send(countMap);		
				}
			});
	}.bind(this));
	
	this.app.delete('/users/:userName', function(req, res)
	{
		var name = req.params.userName;
		this.deleteUser(name, function(err, reply)
			{
				if (err)
				{
					res.status(500).send(err);
				}
				else 
				{
					if (reply > 0) res.send("OK");		
					else res.send("NOT EXISTS");		
				}
			});
	}.bind(this));
	
	var redisPort = process.env.REDIS_PORT || this.config.redisPort;
	var redisHost = process.env.REDIS_HOST || this.config.redisHost;
	
	this.redisClient = redis.createClient(redisPort, redisHost, {return_buffers:true});
	this.redisSubClient = redis.createClient(redisPort, redisHost, {return_buffers:true});
	
	var redisPass = process.env.REDIS_PASS || this.config.redisPass;
	if (redisPass)
	{
		this.redisClient.auth(redisPass);
		this.redisSubClient.auth(redisPass);
	}
	
	var redisDb = process.env.REDIS_DB || this.config.redisDb;
	
	this.redisClient.select(redisDb, function(err, reply)
	{
		if (err) 
		{
			console.log("Redis Error: " + err);
			process.exit(1); //Exit
		}
	});
	
	this.loadLuaScript("send_score", this.addLuaScript.bind(this));	
	this.loadLuaScript("delete_user", this.addLuaScript.bind(this));	

	this.redisClient.on("error", function (err) 
	{
		console.log("Redis Error: " + err);
	});
	
	var serverPort = process.env.PORT || this.config.serverPort;
	
    //this.socketServer = new WebSocket.Server({ port: serverPort});
	this.socketServer = new WebSocket.Server({server});
    this.socketServer.on('connection', connectionEstablished.bind(this));
	
    this.socketServer.on('error', function err(e) 
	{
		this.unsubscribe();
		
		console.log("Error: " + e.code);
        process.exit(1); //Exit
    });
	
	this.socketServer.on('close', function () 
	{
		this.unsubscribe();
		
		console.log("Close");
		process.exit(1); //Exit
    });
	
	this.serverMaxConnections = process.env.SERVER_MAX_CONNECTIONS || this.config.serverMaxConnections;

    function connectionEstablished(ws) 
	{
        if (this.clients.length >= this.serverMaxConnections)
		{ 
			console.log("Error: Server full");
            ws.close();
            return;
        }

        function close(error) 
		{
			this.socket.sendPacket = function() {return;};
			
			var index = this.server.clients.indexOf(this.socket);
            if (index != -1) 
			{
				this.server.clients.splice(index, 1);
			}
        }

        ws.remoteAddress = ws._socket.remoteAddress;
        ws.remotePort = ws._socket.remotePort;

        ws.messageHandler = new MessageHandler(this, ws);
        ws.on('message', ws.messageHandler.handleMessage.bind(ws.messageHandler));

        var bindObject = { server: this, socket: ws };
        ws.on('error', close.bind(bindObject));
        ws.on('close', close.bind(bindObject));
		
        this.clients.push(ws);
    }
	
	this.redisSubClient.on("message", function(channelBuf, message) 
	{
		var channel = channelBuf.toString();
		if (channel === leaderboardName)
		{
			var nameLength = message.readUIntLE(0, 1);
			var name = message.slice(1, nameLength + 1).toString();
			var score = message.readUIntLE(nameLength + 1, 4);
			var oldScore = message.readUIntLE(nameLength + 5, 4);
			
			console.log("NOTIFY_SCORE " + name + " " + score + " " + oldScore);
			
			var buf = new Buffer(nameLength + 10);
			buf.writeUInt8(MessageIdEnum.NOTIFY_SCORE, 0);
			buf.writeUInt8(nameLength, 1);
			buf.write(name, 2);
			buf.writeUInt32LE(score, nameLength + 2);
			buf.writeUInt32LE(oldScore, nameLength + 6);
			
			this.sendMessage(buf);
		}
	}.bind(this));
	
	this.subscribe();
};

LeaderboardServer.prototype.loadConfig = function() 
{
	try 
	{
        var load = ini.parse(fs.readFileSync('./server.ini', 'utf-8'));
        for (var obj in load) this.config[obj] = load[obj];
    } 
	catch (err) 
	{
        console.log("Error: Config not found!");
        fs.writeFileSync('./server.ini', ini.stringify(this.config));
    }
};

LeaderboardServer.prototype.loadLuaScript = function(name, callback, replaceValues)
{
	try 
	{
        var data = fs.readFileSync('./lua_scripts/' + name + ".lua", 'utf-8');
		
		if (replaceValues !== undefined)
		{
			for (var i = 0; i < replaceValues.length; ++i)
			{
				var re = new RegExp("_" + i, "g");
				data = data.replace(re, replaceValues[i]);
			}
		}
					
        this.redisClient.script("load", data, function(err, reply)
		{
			if (err)
			{
				console.log("Redis Error: " + "Can't load script " + name);
				process.exit(1); // Exits the program
			}

			callback(name, reply);
		});
    } 
	catch (err) 
	{
        console.log("Error: Script " + name + " not found!");
		process.exit(1); // Exits the program
    }
}

LeaderboardServer.prototype.getLuaScriptHash = function(name) 
{
	var hash = this.luaScripts[name];
	
	if (hash === undefined) return null;
	return hash;
}

LeaderboardServer.prototype.subscribe = function() 
{
	this.redisSubClient.subscribe(leaderboardName, function(err, reply) 
	{
		if (err) console.log(err);
		console.log("Subscrible to " + reply.toString());
	});
}

LeaderboardServer.prototype.unsubscribe = function() 
{
	this.redisSubClient.unsubscribe(leaderboardName, function(err, reply) 
	{
		if (err) console.log(err);
		console.log("Unsubscrible to " + reply.toString());
	});
}

LeaderboardServer.prototype.sendScore = function(ws, name, score)
{
	var time = ~~(Date.now() / 1000)
	console.log("SEND_SCORE " + name + " " + score + " " + time);
	this.redisClient.evalsha(this.getLuaScriptHash("send_score"), 4, leaderboardName, name, score, time, function(err, reply)
	{
		if (err)
		{
			console.log(err);
		}
		else 
		{
			if (reply)
			{
				this.replyScore(ws, score);
			}
		}
	}.bind(this));
}

LeaderboardServer.prototype.countUserUpdate = function(name, callback)
{
	console.log("COUNT_USER_UPDATE " + name);
	this.redisClient.get("C|" + name, callback);
}

LeaderboardServer.prototype.listUpdate = function(timeStart, timeEnd, callback)
{
	console.log("LIST_UPDATE " + timeStart + " " + timeEnd);
	this.redisClient.zrangebyscore("L|" + leaderboardName, timeStart, timeEnd, callback);
}

LeaderboardServer.prototype.deleteUser = function(name, callback)
{
	console.log("DELETE_USER " + name);
	this.redisClient.evalsha(this.getLuaScriptHash("delete_user"), 2, leaderboardName, name, callback);
}

LeaderboardServer.prototype.requestLeaderboard = function(ws, count)
{
	console.log("REQUEST_LEADERBOARD " + count);
	this.redisClient.zrevrange(leaderboardName, 0, count, 'withscores', function(err, reply)
	{
		if (err)
		{
			console.log(err);
		}
		else 
		{
			this.replyLeaderboard(ws, reply);
		}
	}.bind(this));
}

LeaderboardServer.prototype.replyLeaderboard = function(ws, arr)
{
	var names = [];
	var scores = [];
	
	var bufLen = 1 + 1;
	var numItems = 0;
	
	console.log("REPLY_LEADERBOARD");
	
	var len = arr.length;
	for (var i = 0; i < len; i += 2)
	{
		var childBuf = arr[i];
		var name = childBuf.toString();
		names.push(name);
		bufLen += 1 + name.length;
		
		childBuf = arr[i + 1];
		var score = parseInt(childBuf.toString());
		bufLen += 4;
		
		scores.push(score);
		
		numItems++;
	}
	
	var buf = new Buffer(bufLen);
	buf.writeUInt8(MessageIdEnum.REPLY_LEADERBOARD, 0);
	
	var pos = 1;
	
	buf.writeUInt8(numItems, pos);
	pos++;

	for (var i = 0; i < numItems; ++i)
	{
		var name = names[i];
		var nameLen = name.length;
	
		buf.writeUInt8(nameLen, pos);
		buf.write(name, pos + 1);
		pos += nameLen + 1;
			
		buf.writeUInt32LE(scores[i], pos);
		pos += 4;
	}
	
	ws.sendMessage(buf);
}

LeaderboardServer.prototype.requestScore = function(ws, name)
{
	console.log("REQUEST_SCORE " + name);
	this.redisClient.zscore(leaderboardName, name, function(err, reply)
	{
		if (err)
		{
			console.log(err);
		}
		else 
		{
			if (reply)
			{
				var score = parseInt(reply);
				this.replyScore(ws, score);
			}
		}
	}.bind(this));
}

LeaderboardServer.prototype.replyScore = function(ws, score)
{
	var buf = new Buffer(5);
	buf.writeUInt8(MessageIdEnum.REPLY_SCORE, 0);
	buf.writeUInt32LE(score, 1);
	
	ws.sendMessage(buf);
}

LeaderboardServer.prototype.sendMessage = function(buf)
{
	for (var i = 0; i < this.clients.length; ++i) 
	{
		client = this.clients[i];
		if (!client) continue;
		
		client.sendMessage(buf);
	}
}

WebSocket.prototype.sendMessage = function(buf) 
{
	if (this.readyState == WebSocket.OPEN) 
	{
        this.send(buf, {binary: true});
    } 
	else
	{
        this.readyState = WebSocket.CLOSED;
        this.emit('close');
        this.removeAllListeners();
    }
};