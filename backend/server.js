const express = require('express');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const mongoose = require('mongoose');
const Transcription = require('./transcription');
const Order = require('./Order');
const Groq = require('groq-sdk');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const productList = require('./data.json');



const app = express();
const port = 4000;
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: 'uploads/' });

const groqApiKey = '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';
const groqUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';

const groq = new Groq({ apiKey: groqApiKey });

const mongoURI = 'mongodb://localhost:27017/voice2product';

mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.post('/transcribe', upload.single('audioFile'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No audio file uploaded');
  }

  const audioFilePath = path.join(__dirname, req.file.path);

  try {
    const audioStream = fs.createReadStream(audioFilePath);
    const formData = new FormData();
    formData.append('file', audioStream, req.file.originalname);
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
    });

    if (response.data.text) {
      const transcription = response.data.text;
      await handleProductData(transcription);
      res.json({ success: true, message: 'Audio processed successfully' });
    } else {
      res.status(400).send('No speech detected in the audio');
    }

    fs.unlinkSync(audioFilePath);
  } catch (error) {
    console.error('Error during transcription:', error);
    res.status(500).send('An error occurred during transcription');
  }
});

app.get('/transcriptions', async (req, res) => {
  try {
    const lastTranscription = await Transcription.findOne().sort({ _id: -1 }).exec();
    if (lastTranscription) {
      res.json(lastTranscription);
    } else {
      res.status(404).send('No transcriptions found');
    }
  } catch (error) {
    console.error('Error fetching transcriptions:', error);
    res.status(500).send('An error occurred while fetching transcriptions');
  }
});
// Update this endpoint in your server.js
app.put('/transcriptions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { products, changeRecord } = req.body;

    if (!products) {
      return res.status(400).send('Products data is required.');
    }

    const updateData = {
      products: products
    };

    if (changeRecord) {
      updateData.$push = { changeHistory: changeRecord };
    }

    const updatedTranscription = await Transcription.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    if (!updatedTranscription) {
      return res.status(404).send('Transcription not found.');
    }

    res.json(updatedTranscription);
  } catch (error) {
    console.error('Error updating transcription:', error);
    res.status(500).send('Error updating transcription.');
  }
});


app.post('/api/orders', async (req, res) => {
  try {
    const { products } = req.body;

    if (!products || products.length === 0) {
      return res.status(400).json({ message: 'No products provided' });
    }

    let total = 0;
    const updatedProducts = products.map(product => {
      const subtotal = product.quantity * product.price;
      total += subtotal;

      return { ...product, subtotal };
    });

    const newOrder = new Order({
      products: updatedProducts,
      total,
    });

    const savedOrder = await newOrder.save();

    return res.status(201).json(savedOrder);
  } catch (error) {
    console.error('Error creating order:', error);
    return res.status(500).json({ message: 'Server error. Could not create order.' });
  }
});

function loadDatabaseFromTextFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');

    const lines = fileContent.split('\n').filter(line => line.trim() !== '');

    const products = lines.map(line => {
      const [name] = line.split(' - ');
      return { name: name.trim() };
    });

    return products;
  } catch (error) {
    console.error('Error reading the text file:', error);
    return [];
  }
}

const dbFilePath = './data.txt'; 
const dbProducts = loadDatabaseFromTextFile(dbFilePath);

async function handleProductData(transcription) {
  console.log('Database products:', dbProducts);

  const prompt = {
    transcription: transcription,
    request: "Please provide the list of products and their quantities in the format: Product - Name: [name], Quantity: [quantity], Unit: [unit]. Example: Tomato - Name: Tomato, Quantity: 5, Unit: kg. Return the products list in plain text, no JSON required.",
    };


  try {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: JSON.stringify(prompt),
        },
      ],
      model: "llama-3.3-70b-versatile",
    });

    const aiResponse = completion.choices[0]?.message?.content || "";
    const cleanedResponse = aiResponse.replace(/\s+/g, ' ').trim();

    const productData = [];
    const regex = /([a-zA-Z\s]+) - Name: ([a-zA-Z\s]+), Quantity: (\d+), Unit: ([a-zA-Z]+)/g;
    let match;

    while ((match = regex.exec(cleanedResponse)) !== null) {
      const product = {
        name: match[2].trim(),
        quantity: Number(match[3]),
        unit: match[4].trim(),
      };
      productData.push(product);
    }

    if (productData.length > 0) {
      const formattedData = {
        transcription: transcription,
        products: productData,
      };
      await storeInDB(formattedData);
    }
  } catch (error) {
    console.error("Error in AI response:", error);
  }
}

async function storeInDB(data) {
  try {
    const newTranscription = new Transcription({
      transcription: data.transcription,
      products: data.products,
    });
    await newTranscription.save();
    console.log('Transcription and product data saved to database');
  } catch (error) {
    console.error('Error saving data to database:', error);
  }
}

app.post('/api/match-product', async (req, res) => {
  const { productName } = req.body;

  if (!productName || !productList || !Array.isArray(productList)) {
    return res.status(400).json({ 
      error: 'Invalid request format. Requires productName and productList array.' 
    });
  }

  // Filter products for potential matches
  const filteredProducts = productList.filter(product =>
    product.name.toLowerCase().includes(productName.toLowerCase())
  );

  console.log('Filtered product list:', filteredProducts);

  const prompt = `
    Given the product name "${productName}" and the following product list:
    ${JSON.stringify(filteredProducts, null, 2)}
    
    Find the single best matching product from the list. Consider similar names, common misspellings, and abbreviations.
    Respond in this format:
    ProductName: [BestMatchingProductName], Price: [Price]
    If no match is found, respond with: ProductName: null, Price: null.
  `;

  try {
    // Request completion from Groq AI
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      max_tokens: 500,
    });

    const responseContent = completion.choices[0]?.message?.content?.trim() || '';
    console.log('Raw AI Response:', responseContent);

    if (!responseContent) {
      return res.status(200).json({ name: null, price: null });
    }

    // Parse the AI response to the required JSON format
    try {
      const match = responseContent.match(/ProductName:\s*(.*?),\s*Price:\s*(.*)/);
if (!match) {
  throw new Error('Invalid response format from AI');
}

const name = match[1].trim() === 'null' ? productName : match[1].trim();

// Ensure the price is a number; if not, set it to 0
const priceString = match[2].trim();
const price = /^[0-9]+(\.[0-9]+)?$/.test(priceString) ? parseFloat(priceString) : 0;

      const result = { name, price };
      console.log('Parsed AI Result:', result);

      return res.status(200).json(result);
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
      return res.status(500).json({ 
        error: 'Failed to parse AI response', 
        details: parseError.message 
      });
    }
  } catch (error) {
    console.error('Groq AI Error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message 
    });
  }
});



app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});