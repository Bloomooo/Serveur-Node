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

let lastUserId = 0;

expressApp.use(express.json());

io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  socket.on("registerUser", (data) => {
    const { name } = data;
    const id = generateUserId();
    users[id] = { socketId: socket.id, username: name };
    console.log(`User registered: ${name} with ID: ${id}`);
  });
  socket.on("disconnect", async () => {
    console.log("Client disconnected:", socket.id);

    let lobbyIdFound;
    for (const [lobbyId, lobby] of Object.entries(lobbies)) {
      const index = lobby.players.findIndex(
        (player) => player.id === socket.id
      );
      if (index !== -1) {
        const playerRemoved = lobby.players.splice(index, 1)[0];
        lobbyIdFound = lobbyId;
        try {
          await db
            .collection("lobby")
            .doc(lobbyId)
            .update({
              players: lobby.players.map((player) => ({
                id: player.id,
                name: player.name,
              })),
            });
          console.log(
            `Player ${playerRemoved.name} removed from lobby ${lobbyId} in database.`
          );

          io.to(lobbyId).emit("updatePlayersList", lobby.players);
        } catch (err) {
          console.error(
            `Error updating lobby ${lobbyId} in database after player disconnect:`,
            err
          );
        }
        break;
      }
    }

    if (!lobbyIdFound) {
      console.log(`No lobby found for the disconnected player: ${socket.id}`);
    }
  });

  socket.on("createLobby", (data) => {
    console.log("createLobby event received with data:", data);
    const user = findUser(socket.id);
    if (user) {
      const { userId, username } = user;
      const lobbyId = generateLobbyId();
      const { name } = data;
      createLobby(lobbyId, name, userId, username);
      io.emit("lobbyCreated", { lobbyId, name, username });
    } else {
      console.log("No user found");
    }
  });

  socket.on("joinLobby", async (data) => {
    const user = findUser(socket.id);
    if (user) {
      const { userId, username } = user;
      const { lobbyId } = data;
      const lobby = lobbies[lobbyId];

      if (lobby) {
        const isUserAlreadyInLobby = lobby.players.some(
          (player) => player.id === userId || player.name === username
        );

        if (!isUserAlreadyInLobby && lobby.players.length < 4) {
          lobby.players.push({ id: userId, name: username });
          socket.join(lobbyId);

          io.emit("updatePlayersList", "updatePlayersList");
          console.log(`${username} joined lobby ${lobbyId}`);

          try {
            await db
              .collection("lobby")
              .doc(lobbyId)
              .update({
                players: lobby.players.map((player) => ({
                  id: player.id,
                  name: player.name,
                })),
              });
            console.log(
              `Lobby ${lobbyId} updated in database with new user ${username}`
            );
          } catch (err) {
            console.error(`Error updating lobby ${lobbyId} in database:`, err);
          }
        } else {
          if (isUserAlreadyInLobby) {
            console.log(`${username} is already in the lobby ${lobbyId}`);
          } else {
            console.log(`Lobby ${lobbyId} is full`);
          }
        }
      } else {
        console.log(`Lobby ${lobbyId} does not exist`);
      }
    } else {
      console.log("No user found");
    }
  });

  socket.on("disconnectFromLobby", async (data) => {
    const user = findUser(socket.id);
    if (user) {
      const { userId, username } = user;
      const { lobbyId } = data;
      const lobby = lobbies[lobbyId];

      if (lobby) {
        const index = lobby.players.findIndex((player) => player.id === userId);
        if (index !== -1) {
          const playerRemoved = lobby.players.splice(index, 1)[0];
          try {
            await db
              .collection("lobby")
              .doc(lobbyId)
              .update({
                players: lobby.players.map((player) => ({
                  id: player.id,
                  name: player.name,
                })),
              });
            console.log(
              `Player ${playerRemoved.name} removed from lobby ${lobbyId} in database.`
            );

            io.emit("updatePlayersList", "updatePlayersList");
          } catch (err) {
            console.error(
              `Error updating lobby ${lobbyId} in database after player disconnect:`,
              err
            );
          }
        } else {
          console.log(`Player ${username} is not in lobby ${lobbyId}`);
        }
      } else {
        console.log(`Lobby ${lobbyId} does not exist`);
      }
    } else {
      console.log("No user found");
    }
  });
});

function generateLobbyId() {
  return Math.random().toString(36).substr(2, 9);
}

async function createLobby(lobbyId, lobbyName, id, username) {
  const newLobby = {
    id: lobbyId,
    name: lobbyName,
    host: { id: id, name: username },
    players: [{ id: id, name: username }],
  };

  lobbies[lobbyId] = newLobby;

  try {
    await db.collection("lobby").doc(lobbyId).set(newLobby);
    console.log("Lobby created:", lobbyId);
  } catch (err) {
    console.error("Error creating lobby:", err);
  }
}

function findUser(socketId) {
  for (const userId in users) {
    if (users[userId].socketId === socketId) {
      return { userId, username: users[userId].username };
    }
  }
  return null;
}

function generateUserId() {
  return lastUserId++;
}

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
