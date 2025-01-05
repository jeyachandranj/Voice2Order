const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  unit: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  subtotal: { type: Number, required: false },
});

const orderSchema = new mongoose.Schema({
  products: [productSchema], // Embed the product schema here
  total: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
