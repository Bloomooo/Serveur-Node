require("dotenv").config();

const express = require("express");
const expressApp = express();
const http = require("http");
const server = http.createServer(expressApp);
const { Server } = require("socket.io");
const io = new Server(server);

const PORT = process.env.PORT || 4001;

const db = require("./db");

const users = {};

const lobbies = {};

expressApp.use(express.json());

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);
  const userId = generateUserId();
  users[userId] = socket.id;
  socket.on("disconnect", async () => {
    console.log("Client disconnected:", socket.id);
    const userId = findUserId(socket.id);
    if (userId) {
      for (const lobbyId in lobbies) {
        const index = lobbies[lobbyId].users.indexOf(userId);
        if (index !== -1) {
          lobbies[lobbyId].users.splice(index, 1);
          io.to(lobbyId).emit("lobbyMessage", `${userId} a quitté la salle.`);
          console.log(`${userId} left lobby ${lobbyId}`);
          try {
            await db.collection("lobby").doc(lobbyId).update({
              users: lobbies[lobbyId].users,
            });
            console.log(
              `Lobby ${lobbyId} updated in database with new user ${userId}`
            );
          } catch (err) {
            console.error(`Error updating lobby ${lobbyId} in database:`, err);
          }
        }
      }
      delete users[userId];
    }
  });

  socket.on("createLobby", (data) => {
    console.log("createLobby event received with data:", data);
    const userId = findUserId(socket.id);
    if (userId) {
      const lobbyId = generateLobbyId();
      const { name } = data;
      createLobby(lobbyId, name, userId);
      socket.emit("createLobby", { lobbyId });
    } else {
      console.log("No user found");
    }
  });

  socket.on("joinLobby", async (data) => {
    const userId = findUserId(socket.id);
    if (userId) {
      const { lobbyId } = data;
      if (lobbies[lobbyId] && lobbies[lobbyId].users.length < 4) {
        lobbies[lobbyId].users.push(userId);
        socket.join(lobbyId);

        io.to(lobbyId).emit("lobbyMessage", `${userId} a rejoint la salle.`);
        console.log(`${userId} joined lobby ${lobbyId}`);

        try {
          await db.collection("lobby").doc(lobbyId).update({
            users: lobbies[lobbyId].users,
          });
          console.log(
            `Lobby ${lobbyId} updated in database with new user ${userId}`
          );
        } catch (err) {
          console.error(`Error updating lobby ${lobbyId} in database:`, err);
        }
      } else {
        if (!lobbies[lobbyId]) {
          console.log(`Lobby ${lobbyId} does not exist`);
        } else {
          console.log(`Lobby ${lobbyId} is full`);
        }
      }
    } else {
      console.log("No user found");
    }
  });
});

function generateUserId() {
  return Math.random().toString(36).substr(2, 9);
}

function generateLobbyId() {
  return Math.random().toString(36).substr(2, 9);
}

async function createLobby(lobbyId, name, author) {
  lobbies[lobbyId] = {
    name: name,
    author: author,
    users: [author],
  };
  try {
    await db.collection("lobby").doc(lobbyId).set({
      id: lobbyId,
      name: name,
      author: author,
      users: lobbies[lobbyId].users,
    });
    console.log("Lobby created:", lobbyId);
  } catch (err) {
    console.log(err);
  }
}

function findUserId(socketId) {
  for (const userId in users) {
    if (users[userId] === socketId) {
      return userId;
    }
  }
  return null;
}

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
