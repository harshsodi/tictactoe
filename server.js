var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var urlencodedParser = bodyParser.urlencoded({ extended: false })

app.use(cookieParser());
app.use(express.static('public'));
////////////////////////////////////////////////////////////////////////////

app.get('/', function(req, res) {
	if(req.cookies.sessid) {
		res.redirect('join');
	}
	else {
		res.sendfile('index.html');
	}
});

app.post('/join', urlencodedParser, function(req, res) {
	if(!req.cookies.sessid) {
		var sessid = Date.now() + Math.floor(Math.random() * 9999999999);
		res.cookie("sessid",sessid);
		res.cookie('name',req.body.name);
	}
	res.sendfile('join.html');
});

app.get('/join', function(req, res) {
	res.sendfile('join.html');
});

app.get('/game', function(req, res) {
	if(!req.cookies.gameid) {
		res.redirect('join');
	}
	else {
		res.sendfile('game.html');
	}
});

var users = [];
var nameId = [];
var count = 0;

var games = [];

var user = function(name, socket) {
	this.name = name;
	this.socket = socket;
	this.online = true;
	
	this.busy = false;
	this.opponent = null;
	
	this.board = {
		'r0' : 0,
		'r1' : 0,
		'r2' : 0,
		'c0' : 0,
		'c1' : 0,
		'c2' : 0,
		'd1' : 0,
		'd2' : 0
	};
}

var sodigame = function(id, p1, p2) {
	this.id = id;
	this.p1 = p1;i=0; i<3; i++
	this.p2 = p2;
	
	this.turn = p1;
	this.symbol = 'O';
	
	this.board = new Array(3);
	var i, j;
	for(i=0; i<3; i++) {
		this.board[i] = new Array(3);
		for(j=0;j<3;j++) {
			this.board[i][j] = null;
		}
	}
}

function getOnlineUsersFun() {
	var onlineUsers = [];
	for(var u in users) {
		if(!users[u].busy) {
			onlineUsers.push({'name' : users[u].name , 'busy' : false});
			console.log(users[u].name);
		}
		else {
			onlineUsers.push({'name' : users[u].name , 'busy' : true});
			console.log(users[u].name);
		}
	}
	return onlineUsers;
}

var allClients = [];
io.on('connection', function(socket){
	allClients.push(socket);
	
	//when a new user is registered
	socket.on('registerUser', function (data) {
		data = JSON.parse(data);
		if(users[data.id]) {
			console.log(data.name + " already there");
			users[data.id].socket = socket;
			users[data.id].busy = false;
		}
		else {
			console.log('A user connected');
			var utemp = new user(data.name, socket);
			users[data.id] = utemp;
			nameId[data.name] = data.id;
		}
		var onlineUsers = getOnlineUsersFun();
		console.log(JSON.stringify(onlineUsers));
		io.sockets.emit('onlineUsers', JSON.stringify(onlineUsers));
	});
	
	//when someone leaves the casino
	socket.on('leave', function(data) {
		console.log(users[data] + " left");
		if(users[data].opponent) {
			users[users[data].opponent].opponent = null;
		}
		delete users[data];
	});

	//when window closed
	socket.on('disconnect', function () {
		console.log('A user disconnected');
		for(u in users) {
			if(users[u].socket == socket) {
				if(users[users[u].opponent]) {
					users[users[u].opponent].socket.emit('opponentLeft');
				}
			}
		}
		var onlineUsers = getOnlineUsersFun();
		console.log(JSON.stringify(onlineUsers));
		io.sockets.emit('onlineUsers', JSON.stringify(onlineUsers));
	});
	
	//request online users
	socket.on('getOnlineUsers', function() {
		var onlineUsers = getOnlineUsersFun();
		console.log(JSON.stringify(onlineUsers));
		socket.emit('onlineUsers', JSON.stringify(onlineUsers));
	});
	
	//someone challenges someone
	socket.on('challenge', function(data) {
		var challengeDetails = JSON.parse(data);
		console.log(challengeDetails.from + " challenged " + nameId[challengeDetails.to]);
		for(u in users) {
			if(users[u].name == challengeDetails.to) {
								
				users[u].socket.emit('challengeRequest' , users[challengeDetails.from].name);
				console.log("emitted challengeRequest to : " + users[u].name);
				
				users[challengeDetails.from].opponent = nameId[challengeDetails.to];
				
				users[nameId[challengeDetails.to]].opponent = challengeDetails.from;
				
				users[challengeDetails.from].busy = true;
				users[nameId[challengeDetails.to]].busy = true;
				io.sockets.emit('onlineUsers', JSON.stringify(getOnlineUsersFun()));
			}
			console.log("usersList : " + users[u].name + " : " + u + " : " + users[u].opponent);
		}
	});
	
	//challenge cancelled in between between
	socket.on('cancelChallenge', function(data) {
		console.log("Incoming data " + data);
		if(users[data]) {
			users[users[data].opponent].socket.emit('challengeCancelled');
			
			users[data].busy = false;
			users[users[data].opponent].busy = false;
			
			users[users[data].opponent].opponent = null;
			users[data].opponent = null;
			
			io.sockets.emit('onlineUsers', JSON.stringify(getOnlineUsersFun()));
		}
	});
	
	//challenge accepted
	socket.on('acceptChallenge', function (data) {
		console.log(users[data].name + " vs. " + users[users[data].opponent].name);
		
		var gameid = Date.now() + Math.floor(Math.random() * 9999999999);
		var gameTemp = new sodigame(gameid, data, users[data].opponent);
		games[gameid] = gameTemp; 
		
		console.log(games);
		users[data].socket.emit('challengeAccepted', gameid);
		users[users[data].opponent].socket.emit('challengeAccepted', gameid);
	});
});

var game = io.of('/game');

game.on('connection', function(socket) {
	console.log("game is on madhafaka");
	
	socket.on('registerUser', function(data) {
		users[data].socket = socket;
	});
	
	socket.on('startGame', function(data) {
		console.log("game : " + data);
		
		socket.emit('paint', games[data].board);		
	});
	
	socket.on('move', function(data) {
		console.log(data);
		
		var row = parseInt(data.block/10);
		var col = parseInt(data.block%10);
		
		var t = games[data.gameid];
		
		if(data.sessid == t.turn) {
			if(t.board[row][col] == null) {
				t.board[row][col] = t.symbol;
				if(t.symbol == 'O') {
					
					//update users board
					if(row == 3-col) {
						users[t.turn].board.d2 += 1;
					}
					if(row == col) {
						users[t.turn].board.d1 += 1;	
					}
					var rowstr = "r"+row;
					var colstr = "c"+col;
					users[t.turn].board[rowstr] += 1;	
					users[t.turn].board[colstr] += 1;	
					
					console.log(users[t.turn].board);
					
					t.symbol = 'X';
				}
				else {
					t.symbol = 'O'	
				}
			}
			
			if(t.turn == t.p1) {
				t.turn = t.p2;
			}
			else {
				t.turn = t.p1
			}
		}
		
		users[games[data.gameid].p1].socket.emit('paint', games[data.gameid].board);
		users[games[data.gameid].p2].socket.emit('paint', games[data.gameid].board);
		
		for(sequence in users[t.p1].board) {
			if(users[t.p1].board[sequence] == 3) {
				users[t.p1].socket.emit('win');
				users[t.p2].socket.emit('loose');
			}
		}
		for(sequence in users[t.p2].board) {
			if(users[t.p2].board[sequence] == 3) {
				users[t.p2].socket.emit('win');
				users[t.p1].socket.emit('loose');
			}
		}
		
		
	});
});

http.listen(3000, function(){
	console.log('listening on *:3000');
});
