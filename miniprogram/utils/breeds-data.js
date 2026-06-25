const breeds = require('../data/breeds.json');
module.exports = { breeds: breeds.breeds, loadBreeds: () => breeds.breeds };
