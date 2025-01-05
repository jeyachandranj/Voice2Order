const mongoose = require('mongoose');

const transcriptionSchema = new mongoose.Schema({
  transcription: {
    type: String,
    required: true,
  },
  products: [{
    name: {
      type: String,
      required: true, // The name of the product
    },
    quantity: {
      type: Number,
      required: true, // The quantity of the product
    },
    unit: {
      type: String,
      required: true, // The unit of the product
    }
  }]
});

const Transcription = mongoose.model('Transcription', transcriptionSchema);
module.exports = Transcription;
