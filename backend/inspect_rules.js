const mongoose = require('mongoose');
const Rule = require('./models/Rule');

const inspect = async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/auction_db');
    const rules = await Rule.find();
    console.log('Rules collection content:', JSON.stringify(rules, null, 2));
    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
};

inspect();
