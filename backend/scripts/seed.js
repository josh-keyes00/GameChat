const { seedAll } = require('../seedData');

seedAll()
  .then(() => {
    console.log('Seed complete.');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });