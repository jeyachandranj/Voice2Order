const express = require('express');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const mongoose = require('mongoose');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const Groq = require('groq-sdk');
const natural = require('natural');

// Initialize express app
const app = express();
const port = 4000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer configuration for file uploads
const upload = multer({ dest: 'uploads/' });

// Groq API configuration
const groqApiKey = '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';
const groqUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';
const groq = new Groq({ apiKey: groqApiKey });

// MongoDB configuration
const mongoURI = 'mongodb://localhost:27017/voice2product';
mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// MongoDB Schema Definitions
const transcriptionSchema = new mongoose.Schema({
  transcription: String,
  products: Array,
  timestamp: { type: Date, default: Date.now }
});

const orderSchema = new mongoose.Schema({
  products: [{
    name: String,
    ainame : String,
    quantity: Number,
    price: Number,
    subtotal: Number
  }],
  total: Number,
  timestamp: { type: Date, default: Date.now }
});

const Transcription = mongoose.model('Transcription', transcriptionSchema);
const Order = mongoose.model('Order', orderSchema);

// Audio processing constants
const SAMPLE_RATE = 16000;
const CHANNELS = 1;

// Product matching optimization
class ProductMatcher {
  constructor(productList) {
    this.productNameMap = new Map();
    this.commonPrefixMap = new Map();
    this.initialize(productList);
  }

  initialize(productList) {
    productList.forEach(product => {
      const name = product.name.toLowerCase();
      const prefixes = this.generatePrefixes(name);
      
      this.productNameMap.set(name, product);
      prefixes.forEach(prefix => {
        if (!this.commonPrefixMap.has(prefix)) {
          this.commonPrefixMap.set(prefix, []);
        }
        this.commonPrefixMap.get(prefix).push(name);
      });
    });
  }

  generatePrefixes(name) {
    return Array.from(new Set(
      name.split(' ')
        .filter(word => word.length >= 3)
        .map(word => word.slice(0, 3))
    ));
  }

  match(productName) {
    if (!productName) return { success: false, name: '', confidence: 0 };

    const normalizedInput = productName.toLowerCase().trim();
    
    // Direct match check
    if (this.productNameMap.has(normalizedInput)) {
      return {
        success: true,
        name: this.productNameMap.get(normalizedInput).name,
        confidence: 1.0
      };
    }

    // Prefix matching
    const inputPrefixes = this.generatePrefixes(normalizedInput);
    const candidates = new Map();
    
    inputPrefixes.forEach(prefix => {
      (this.commonPrefixMap.get(prefix) || []).forEach(match => {
        candidates.set(match, (candidates.get(match) || 0) + 1);
      });
    });

    if (candidates.size > 0) {
      const bestMatch = Array.from(candidates.entries())
        .sort((a, b) => {
          const countDiff = b[1] - a[1];
          return countDiff !== 0 ? countDiff :
            natural.JaroWinklerDistance(normalizedInput, b[0]) - 
            natural.JaroWinklerDistance(normalizedInput, a[0]);
        })[0][0];

      const similarity = natural.JaroWinklerDistance(normalizedInput, bestMatch);
      
      if (similarity >= 0.6) {
        return {
          success: true,
          name: this.productNameMap.get(bestMatch).name,
          confidence: similarity
        };
      }
    }

    return { success: false, name: productName, confidence: 0 };
  }
}

// Initialize product matcher with product list
const productMatcher = new ProductMatcher(require('./data.json'));

// Audio preprocessing function
async function preprocessAudio(inputPath) {
  const outputPath = inputPath + '_processed.wav';
  
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('wav')
      .audioChannels(CHANNELS)
      .audioFrequency(SAMPLE_RATE)
      .audioFilters([
        'highpass=f=50',
        'lowpass=f=3000',
        'afftdn=nr=10:nf=-25',
        'silenceremove=1:0:-50dB',
        'compand=.3|.3:1|1:-90/-60|-60/-40|-40/-30|-20/-20:6:0:-90:0.2',
        'volume=1.5',
        'dynaudnorm=f=150:g=15:p=0.95',
        'aresample=async=1:first_pts=0',
        'apad=pad_dur=0.5'
      ])
      .on('error', reject)
      .on('end', () => resolve(outputPath))
      .save(outputPath);
  });
}

// Unit normalization
const unitMap = {
  'kilogram': 'kg', 'kilograms': 'kg', 'kgs': 'kg',
  'gram': 'gram', 'grams': 'gram', 'gm': 'gram', 'g': 'gram',
  'piece': 'piece', 'pieces': 'piece', 'pcs': 'piece', 'pc': 'piece',
  'milliliter': 'ml', 'milliliters': 'ml',
  'rupee': 'rupees', 'rs': 'rupees', 'inr': 'rupees'
};

function normalizeUnit(unit) {
  return unitMap[unit.toLowerCase()] || unit;
}

// Product handling function
async function handleProductData(transcription) {
  const systemPrompt = `standard English names.
    Format each product exactly as: ProductName - Name: StandardName, Quantity: Number, Unit: StandardUnit`;

  const userPrompt = `Parse these grocery items and provide quantities: ${transcription}
    Use standard units: kg, gram, piece, ml, rupees
    Example format:
      Rice - Name: Basmati Rice, Quantity: 5, Unit: kg
      Onion - Name: Red Onion, Quantity: 2, Unit: kg`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      model: "mixtral-8x7b-32768",
      temperature: 0.3,
      max_tokens: 1024,
    });

    const aiResponse = completion.choices[0]?.message?.content || "";
    const productRegex = /([^-]+) - Name: ([^,]+), Quantity: ([0-9.]+), Unit: ([^,\n]+)/g;
    const products = [];
    let id = 1;

    for (const match of aiResponse.matchAll(productRegex)) {
      const [_, originalName, standardName, quantity, unit] = match;
      const matchedProduct = productMatcher.match(standardName.trim());
      
      products.push({
        id: id++,
        ainame: originalName.trim(),
        name: matchedProduct.success ? matchedProduct.name : standardName.trim(),
        qty: parseFloat(quantity) || 1,
        unit: normalizeUnit(unit.trim())
      });
    }

    await new Transcription({ transcription, products }).save();
    return products;
    
  } catch (error) {
    console.error('Error processing with Groq API:', error);
    throw error;
  }
}

// Routes
app.post('/transcribe', upload.single('audioFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No audio file uploaded');
  }

  const audioFilePath = path.join(__dirname, req.file.path);
  let processedAudioPath = null;

  try {
    processedAudioPath = await preprocessAudio(audioFilePath);
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(processedAudioPath), req.file.originalname);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('prompt', 'Specify context or spelling');
    formData.append('response_format', 'json');
    formData.append('language', 'en');
    formData.append('temperature', '0.0');

    const response = await axios.post(groqUrl, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${groqApiKey}`,
      },
      maxBodyLength: Infinity,
      timeout: 300000 
    });

    if (response.data.text) {
      const transcription = response.data.text;
      const products = await handleProductData(transcription);
      res.json({ 
        success: true, 
        message: 'Audio processed successfully',
        transcription,
        products
      });
    } else {
      res.status(400).send('No speech detected in the audio');
    }

  } catch (error) {
    console.error('Error during processing:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred during audio processing or transcription',
      error: error.message
    });
  } finally {
    // Cleanup
    [processedAudioPath, audioFilePath].forEach(path => {
      if (path && fs.existsSync(path)) {
        fs.unlinkSync(path);
      }
    });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    const { products } = req.body;
    if (!products?.length) {
      return res.status(400).json({ message: 'No products provided' });
    }

    const updatedProducts = products.map(product => ({
      ...product,
      subtotal: product.quantity * product.price
    }));

    const newOrder = new Order({
      products: updatedProducts,
      total: updatedProducts.reduce((sum, p) => sum + p.subtotal, 0)
    });

    const savedOrder = await newOrder.save();
    res.status(201).json(savedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ message: 'Server error. Could not create order.' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});