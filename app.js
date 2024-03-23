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
  console.log("User connected:", userId);

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    for (const lobbyId in lobbies) {
      const index = lobbies[lobbyId].users.indexOf(userId);
      if (index !== -1) {
        lobbies[lobbyId].users.splice(index, 1);
        io.to(lobbyId).emit("lobbyMessage", `${userId} a quitté la salle.`);
        console.log(`${userId} left lobby ${lobbyId}`);
      }
    }
    delete users[userId];
  });
});

function generateUserId() {
  return Math.random().toString(36).substr(2, 9);
}

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});

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

expressApp.post("/joinLobby", async (req, res) => {
  const { lobby } = req.body;
  const lobbyId = generateUserId();
  await createLobby(lobbyId, lobby.name, lobby.author);
  res.header("lobbyId", lobbyId);
  res.header("message", "Lobby created successfully");
  res.status(201).send();
});
