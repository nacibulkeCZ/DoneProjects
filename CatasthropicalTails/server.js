const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { emit } = require('process');
const mysql = require('mysql');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(express.static(path.join(__dirname, 'public')));

const connection = mysql.createConnection({
  host: 'zpj83vpaccjer3ah.chr7pe7iynqr.eu-west-1.rds.amazonaws.com',
  user: 'f7t1nbbx82xl18kp',
  password: 'alr0v98t9pe8t3ps',
  database: 'sl4w50103z6p72ae'
});

connection.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the database');
});

let waitingUsers = [];
let rooms = {};

io.on('connection', (socket) => {
  console.log('A client connected:', socket.id);

  socket.on('requestRoom', () => {
    if (waitingUsers.length > 0) {
      const otherUser = waitingUsers.shift();
      const roomId = `${socket.id}-${otherUser.id}`;

      socket.join(roomId);
      otherUser.socket.join(roomId);

      if (!rooms[roomId]) {
        rooms[roomId] = {
          users: [],
          areUsersReady: [],
          coinFlipResult: null,
          startingUser: null,
          hasDrawnCards: 0,
        };
      }

      socket.emit('roomAssigned', roomId);
      otherUser.socket.emit('roomAssigned', roomId);
    } else {
      waitingUsers.push({ id: socket.id, socket });
    }
  });

  socket.on('disconnect', () => {
    const rooms = Object.keys(socket.rooms);
    console.log(`Socket ${socket.id} is in rooms:`, rooms);
    rooms.forEach(roomId => {
      if (roomId !== socket.id) {
        console.log(`Emitting userDisconnected to room ${roomId}`);
        io.to(roomId).emit('userDisconnected', `User ${socket.id} has disconnected.`);
        io.in(roomId).socketsLeave(roomId);
        console.log(`Room ${roomId} should now be empty and deleted.`);
      }
    });
  
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
  });

  socket.on('leaveRoom', (roomId) => {
    console.log(`User ${socket.id} left room ${roomId}`);
    socket.emit('userLeft', `You have left the room ${roomId}.`);
    io.to(roomId).emit('userDisconnected', `User ${socket.id} has left the room.`);
  });

  socket.on('isReady', (roomId) => {
    const room = rooms[roomId];
    const userIndex = room.users.indexOf(socket.id);
    room.areUsersReady[userIndex] = true;

    if (room.areUsersReady[0] && room.areUsersReady[1]) {
      userPaws = io.sockets.sockets.get(room.users[0]);
      userTails = io.sockets.sockets.get(room.users[1]);
      userPaws.emit('bothUsersReady', 'paws');
      userTails.emit('bothUsersReady', 'tails');

      const coinFlipResult = Math.random() < 0.5 ? 'paws' : 'tails';
      room.coinFlipResult = coinFlipResult;
      room.startingUser = room.users[coinFlipResult === 'paws' ? 0 : 1];
      io.to(roomId).emit('flipCoin', coinFlipResult); 
    }
  });

  socket.on("winnersChoice", (choice, roomId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);

    if(choice === "start"){
      room.startingUser = socket.id;
      socket.to(otherUserId).emit('loosersChoice', 'deck');
    }
    else if(choice === "orange"){
      room.startingUser = otherUserId;
      socket.to(otherUserId).emit('loosersChoice', 'black');
    }
    else if(choice === "black"){
      room.startingUser = otherUserId;
      socket.to(otherUserId).emit('loosersChoice', 'orange');
    }

  });

  socket.on("loosersChoiceServer", (choice, roomId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);

    socket.to(otherUserId).emit('winnersDeck', choice);
  });

  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    rooms[roomId].users.push(socket.id);
    console.log(`User ${socket.id} joined room ${roomId}`);
      
    setTimeout(() => {
      socket.emit('greetUser', `Your id is ${socket.id} and you are in room ${roomId} with users: ${rooms[roomId].users}`);
      const sql = 'SELECT * FROM cards';
      connection.query(sql, (error, results) => {
        if (error) {
          console.error('Error retrieving cards:', error);
          socket.emit('error', { message: 'Error retrieving cards ' + error });
        } else {
          socket.emit('message', results);
        }
    });
    }, 100); 
  });

  socket.on('getDeck', (color, roomId) => {
    socket.emit('message', color);
    const sql = 'SELECT * FROM cards WHERE race = ?';
    connection.query(sql, [color], (error, results) => {
      if (error) {
        socket.emit('error', { message: 'Error retrieving cards ' + error });
      } else {
        socket.emit('mulligan', results);
      }
    });

    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    const otherColor = color === 'orange' ? 'black' : 'orange';
    connection.query(sql, [otherColor], (error, result) => {
      if (error) {
        socket.emit('error', { message: 'Error retrieving cards ' + error });
      } else {
        socket.to(otherUserId).emit('mulligan', result);
      }
    });
  });

  socket.on("addCardToBoard", (roomId, cardUrl, x, y, cardId, cardCost, cardType, cardRace, deck) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('addCardToBoard', cardUrl, x, y, cardId, cardCost, cardType, cardRace, deck);   
  });

  socket.on("updateDeck", (roomId, deck) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('updateDeck', deck);
  });

  socket.on("moveOnBoard", (roomId, cardUrl, x, y, moveTox, moveToy) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('moveOnBoard', cardUrl, x, y, moveTox, moveToy); 
  });

  socket.on("mulligan", (roomId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    room.hasDrawnCards++;
    if(room.hasDrawnCards === 2){
      startingUser = room.startingUser;
      socket.to(otherUserId).emit('start2');
      io.to(startingUser).emit('start');
    }
  });

  socket.on("endTurn", (roomId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('start');
  });

  socket.on("sendDeck", (myDeck, roomId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('oponentDeck', myDeck);
  });

  socket.on("addTarget", (roomId, targetId, targetNum) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('addTarget', targetId, targetNum);
  });

  socket.on("removeTarget", (targetId, roomId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('removeTarget', targetId);
  });

  socket.on("updateSources", (roomId, sources, oponentSources) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('updateSources', sources, oponentSources);
  });

  socket.on("removeCard", (roomId, cardId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('removeCard', cardId);
  });

  socket.on("attackPass", (roomId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('attackPass');
  });

  socket.on("hurt", (cardId, roomId, vitality) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('hurt', cardId, vitality);
  });

  socket.on("flipLocation", (roomId, location, isFliped) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('flipLocation', location, isFliped);
  });

  socket.on("defended", (cardId, roomId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('defended', cardId);
  });

  socket.on("switch", (roomId, rapture, switchId) => {
    const room = rooms[roomId];
    const otherUserId = room.users.find(id => id !== socket.id);
    socket.to(otherUserId).emit('switch', rapture, switchId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
