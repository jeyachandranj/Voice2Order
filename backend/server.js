const express = require('express');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const FormData = require('form-data');
const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');
const Transcription = require('./transcription'); 
const Groq = require('groq-sdk'); 
const cors = require('cors');

const app = express();
const port = 4000;
app.use(cors("*"));

const upload = multer({ dest: 'uploads/' });

const groqApiKey = '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'; 
const groqUrl = 'https://api.groq.com/openai/v1/audio/transcriptions';

const groq = new Groq({ apiKey: groqApiKey });

const mongoURI = 'mongodb://localhost:27017/voice2product';

mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true })
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
      res.json({ transcription: transcription });
      await handleProductData(transcription);
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
    const lastTranscription = await Transcription.findOne().sort({ _id: -1 }).exec(); // Sort by _id to get the latest document
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


async function handleProductData(transcription) {
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
      console.log("AI Response:", aiResponse);  
  
      const cleanedResponse = aiResponse.replace(/\s+/g, ' ').trim();
      console.log("Cleaned AI Response:", cleanedResponse);  
  
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
  
        storeInDB(formattedData);
      } else {
        console.log("No valid product data found in AI response.");
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
  


app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
