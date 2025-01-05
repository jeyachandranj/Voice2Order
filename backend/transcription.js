const mongoose = require('mongoose');

const transcriptionSchema = new mongoose.Schema({
  transcription: {
    type: String,
    required: true,
  },
  products: [{
    name: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    unit: {
      type: String,
      required: true,
    }
  }]
});

const Transcription = mongoose.model('Transcription', transcriptionSchema);
module.exports = Transcription;
