require("dotenv").config();

const express = require("express");
const expressApp = express();
const http = require("http");
const server = http.createServer(expressApp);
const { Server } = require("socket.io");
const io = new Server(server);

const PORT = process.env.PORT || 4001;

const db = require("./db/db");

const { generateUserId, findUser, getUser } = require("./user/user");
const {
  createLobby,
  generateLobbyId,
  getLobbies,
  getAnimeListByLobby,
} = require("./lobby/lobby");
const { checkAndStartGame, processResults } = require("./game/game");

const users = getUser();
const lobbies = getLobbies();
const animeListsByLobby = getAnimeListByLobby();

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

          io.emit("updatePlayersList", "updatePlayersList");
          if (lobby.players.length === 0) {
            delete lobbies[lobbyId];
            try {
              await db.collection("lobby").doc(lobbyId).delete();
              console.log(`Lobby ${lobbyId} deleted from database.`);
              io.emit("removeLobby", { lobbyId });
            } catch (err) {
              console.error(
                `Error deleting lobby ${lobbyId} from database:`,
                err
              );
            }
          }
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

  socket.on("createLobby", async (data) => {
    const user = findUser(socket.id);
    if (user) {
      const { userId, username } = user;
      const lobbyId = generateLobbyId();
      const { name, nb, animeList } = data;

      const lobbyAnimeList = [];
      for (let i = 1; i < animeList.length; i++) {
        const { title, image } = animeList[i];
        if (!title || !image) {
          console.error("Invalid anime data received:", animeList[i]);
          return;
        }
        const anime = { title, image };
        if (!lobbyAnimeList.some((a) => a.title === anime.title)) {
          lobbyAnimeList.push(anime);
        }
      }

      createLobby(lobbyId, name, userId, username, nb, lobbyAnimeList);
      socket.join(lobbyId);
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

            if (animeListsByLobby[lobbyId].length > 0) {
              const userAnimeList = data.animeList.slice(1);
              for (const animeData of userAnimeList) {
                const { title, image } = animeData;
                if (!title || !image) {
                  console.error("Invalid anime data received:", animeData);
                  return;
                }

                const anime = { title, image };
                if (
                  !animeListsByLobby[lobbyId].some(
                    (a) => a.title === anime.title
                  )
                ) {
                  animeListsByLobby[lobbyId].push(anime);
                }
              }
            }
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
          if (lobby.players.length === 0) {
            delete lobbies[lobbyId];
            try {
              await db.collection("lobby").doc(lobbyId).delete();
              io.emit("removeLobby", { lobbyId });
              console.log(`Lobby ${lobbyId} deleted from database.`);
            } catch (err) {
              console.error(
                `Error deleting lobby ${lobbyId} from database:`,
                err
              );
            }
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

  socket.on("startGame", (data) => {
    const lobbyId = data.lobbyId;
    io.to(lobbyId).emit("gameStarted", animeListsByLobby[lobbyId]);
    checkAndStartGame(lobbyId, io);
  });

  socket.on("sendResults", (data) => {
    console.log("Results received:", data);
    processResults(data, io);
  });
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
