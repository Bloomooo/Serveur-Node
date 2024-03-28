const { selectAnimeRandom } = require("../anime/anime");
const lobbies = require("../lobby/lobby").getLobbies();
const animeListsByLobby = require("../lobby/lobby").getAnimeListByLobby();

function checkAndStartGame(lobbyId, io) {
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

function processResults(data, io) {
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

module.exports = {
  checkAndStartGame,
  processResults,
};
