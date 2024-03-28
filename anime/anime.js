const animeListsByLobby = require("../lobby/lobby").getAnimeListByLobby();

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

module.exports = {
  selectAnimeRandom,
};
