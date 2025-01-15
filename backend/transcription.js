const mongoose = require('mongoose');

const transcriptionSchema = new mongoose.Schema({
  transcription: {
    type: String,
    required: true,
  },
  products: [{
    id: {
      type: Number,
      required: true, // The ID of the
    },
    ainame: {
      type: String,
      required: true, // The name of the product as spoken by the customer
    },
    name: {
      type: String,
      required: true, // The name of the product
    },
    qty: {
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
