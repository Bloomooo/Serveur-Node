require("dotenv").config();

const express = require("express");
const expressApp = express();
const http = require("http");
const server = http.createServer(expressApp);
const { Server } = require("socket.io");
const io = new Server(server);

const PORT = process.env.PORT || 4001;

const db = require("./db");
const { log } = require("console");

const users = {};
const lobbies = {};
const animeListsByLobby = {};

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
    checkAndStartGame(lobbyId);
  });

  socket.on("sendResults", (data) => {
    console.log("Results received:", data);
    processResults(data);
  });
});
function generateLobbyId() {
  return Math.random().toString(36).substr(2, 9);
}

async function createLobby(lobbyId, lobbyName, id, username, nb, animeList) {
  const newLobby = {
    id: lobbyId,
    name: lobbyName,
    host: { id: id, name: username },
    nb: nb,
    players: [{ id: id, name: username }],
    sentAnimes: [],
  };

  lobbies[lobbyId] = newLobby;
  animeListsByLobby[lobbyId] = animeList;

  try {
    await db
      .collection("lobby")
      .doc(lobbyId)
      .set({
        ...newLobby,
      });
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
function checkAndStartGame(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (!lobby) return;

  const animeList = animeListsByLobby[lobbyId];
  if (!animeList || animeList.length === 0) {
    console.log("No anime list found for the lobby.");
    return;
  }

  const numAnimeMax = lobby.nb;
  if (animeList.length >= numAnimeMax) {
    const animeListRandom = selectAnimeRandom(lobbyId, numAnimeMax);

    setTimeout(() => {
      const anime = animeListRandom[0];
      console.log("Sending anime:", anime.title);
      lobby.sentAnimes.push(anime);
      io.to(lobbyId).emit("sendAnime", {
        title: anime.title,
        image: anime.image,
        length: animeListRandom.length,
        index: 1,
      });

      let counter = 1;
      const interval = setInterval(() => {
        if (counter >= animeListRandom.length) {
          clearInterval(interval);
          return;
        }
        const anime = animeListRandom[counter];
        lobby.sentAnimes.push(anime);
        console.log("Sending anime:", anime.title);
        io.to(lobbyId).emit("sendAnime", {
          title: anime.title,
          image: anime.image,
          length: animeListRandom.length,
          index: counter + 1,
        });
        counter++;
      }, 30000);
    }, 10000);
  }
}

function generateUserId() {
  return lastUserId++;
}
function selectAnimeRandom(lobbyId, maxAnime) {
  const animeList = animeListsByLobby[lobbyId];
  if (!animeList || animeList.length === 0) {
    console.log("No anime list found for the lobby.");
    return [];
  }

  const shuffledAnime = [...animeList];
  for (let i = shuffledAnime.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledAnime[i], shuffledAnime[j]] = [shuffledAnime[j], shuffledAnime[i]];
  }

  return shuffledAnime.slice(0, Math.min(maxAnime, shuffledAnime.length));
}

function processResults(data) {
  const { lobbyId, username, answer } = data;
  const lobby = lobbies[lobbyId];
  if (!lobby) {
    console.log(`Lobby ${lobbyId} not found.`);
    return;
  }

  const lastSentAnime = lobby.sentAnimes[lobby.sentAnimes.length - 1];
  if (!lastSentAnime) {
    console.log("No anime was sent recently to this lobby.");
    return;
  }

  const isCorrect = lastSentAnime.title.toLowerCase() === answer.toLowerCase();

  const playerIndex = lobby.players.findIndex(
    (player) => player.name === username
  );
  if (playerIndex !== -1) {
    lobby.players[playerIndex].answer = answer;
    lobby.players[playerIndex].isCorrect = isCorrect;
  }

  const results = lobby.players.map((player) => ({
    username: player.name,
    answer: player.answer,
    isCorrect: player.isCorrect || false,
  }));

  io.to(lobbyId).emit("gameResults", results);

  console.log(`Results sent to lobby ${lobbyId}:`, results);
}

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
