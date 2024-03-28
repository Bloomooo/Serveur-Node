const db = require("../db/db");
const lobbies = {};
const animeListsByLobby = {};

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

function generateLobbyId() {
  return Math.random().toString(36).substr(2, 9);
}

function getLobbies() {
  return lobbies;
}

function getAnimeListByLobby() {
  return animeListsByLobby;
}
module.exports = {
  createLobby,
  generateLobbyId,
  getLobbies,
  getAnimeListByLobby,
};
