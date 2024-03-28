let lastUserId = 0;

const users = {};

function generateUserId() {
  return lastUserId++;
}

function findUser(socketId) {
  for (const userId in users) {
    if (users[userId].socketId === socketId) {
      return { userId, username: users[userId].username };
    }
  }
  return null;
}

function getUser() {
  return users;
}
module.exports = {
  generateUserId,
  findUser,
  getUser,
};
