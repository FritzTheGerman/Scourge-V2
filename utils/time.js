function getCSTTime() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Chicago'
  });
}

module.exports = {
  getCSTTime
};
