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
const productList = require('./data.json');
const Fuse = require('fuse.js');
const { spawn } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const sox = require('sox-stream');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');





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




const SAMPLE_RATE = 16000;
const CHANNELS = 1;

async function preprocessAudio(inputPath) {
    const outputPath = inputPath + '_processed.wav';
    
    try {
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .toFormat('wav')
                .audioChannels(CHANNELS)
                .audioFrequency(SAMPLE_RATE)
                .audioFilters([
                    // Remove background noise and normalize
                    'highpass=f=50',          // Remove low frequency noise
                    'lowpass=f=3000',         // Remove high frequency noise
                    'afftdn=nr=10:nf=-25',    // FFT noise reduction
                    'silenceremove=1:0:-50dB', // Remove silence
                    // Normalize and enhance speech
                    'compand=.3|.3:1|1:-90/-60|-60/-40|-40/-30|-20/-20:6:0:-90:0.2',
                    'volume=1.5',             // Increase volume
                    'dynaudnorm=f=150:g=15:p=0.95', // Dynamic audio normalization
                    'aresample=async=1:first_pts=0', // Ensure consistent timing
                    'apad=pad_dur=0.5'        // Add small padding
                ])
                .on('error', (err) => {
                    console.error('FFmpeg error:', err);
                    reject(err);
                })
                .on('end', () => {
                    console.log('Audio preprocessing completed');
                    resolve();
                })
                .save(outputPath);
        });

        return outputPath;
    } catch (error) {
        console.error('Preprocessing error:', error);
        throw new Error(`Audio preprocessing failed: ${error.message}`);
    }
}

app.post('/transcribe', upload.single('audioFile'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No audio file uploaded');
    }

    const audioFilePath = path.join(__dirname, req.file.path);
    let processedAudioPath = null;

    try {
        processedAudioPath = await preprocessAudio(audioFilePath);
        console.log('Processed audio saved at:', processedAudioPath);
        
        const formData = new FormData();
        const audioStream = fs.createReadStream(processedAudioPath);
        
        formData.append('file', audioStream, req.file.originalname);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('prompt', 'Specify context or spelling');
        formData.append('response_format', 'json');
        formData.append('language', 'en');
        formData.append('temperature', '0.0');

        // Send to transcription service
        const response = await axios.post(groqUrl, formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Bearer ${groqApiKey}`,
            },
            maxBodyLength: Infinity,
            timeout: 300000 // 5 minute timeout
        });

        if (response.data.text) {
            const transcription = response.data.text;
            await handleProductData(transcription);
            res.json({ 
                success: true, 
                message: 'Audio processed successfully',
                transcription: transcription 
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
        // Clean up files
        try {
            if (processedAudioPath && fs.existsSync(processedAudioPath)) {
                fs.unlinkSync(processedAudioPath);
            }
            if (fs.existsSync(audioFilePath)) {
                fs.unlinkSync(audioFilePath);
            }
        } catch (cleanupError) {
            console.error('Error during cleanup:', cleanupError);
        }
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



async function handleProductData(transcription) {

  const prompt = {
    transcription: transcription,
    request: `Please ensure the product name is spelled correctly and matches common grocery items.Please ensure the product name is correctly interpreted even if the customer uses "Tanglish" (a mix of Tamil and English). For example, if the customer says "Ventakai," interpret it as "Okra," and if they say "Takkali," interpret it as "Tomato." Provide the output in the format:and their quantities in the format: Product - Name: [name], Quantity: [quantity], Unit: [unit]. Example: Tomato - Name: Tomato, Quantity: 5, Unit: kg. Return the products list in plain text, no JSON required.`,
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

const options = {
  keys: ["name"],
  threshold: 0.3, 
};

const fuse = new Fuse(productList, options);

app.post('/api/match-product', async (req, res) => {
  const { productName } = req.body;

  if (!productName) {
    return res.status(400).json({ error: 'Product name is required' });
  }

  try {
    const result = fuse.search(productName);

    if (result.length > 0) {
      const bestMatch = result[0].item; // Get the top match
      console.log('Customer Input:', productName);
      console.log('Best Match:', bestMatch.name);
      console.log('Matching Product Details:', bestMatch);

      return res.status(200).json({
        success: true,
        name: bestMatch.name,
        score: bestMatch,
      });
    } else {
      const reresult = fuse.search(productName);

      if (reresult.length > 0) {
        const bestMatch = result[0].item; // Get the top match
        console.log('Customer Input:', productName);
        console.log('Best Match:', bestMatch.name);
        console.log('Matching Product Details:', bestMatch);
  
        return res.status(200).json({
          success: true,
          name: bestMatch.name,
          score: bestMatch,
        });
      } else {
      return res.status(404).json({
        success: false,
        message: 'No matching product found',
      });
    }
    }
  } catch (error) {
    console.error('Error matching product:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      details: error.message 
    });
  }
});




app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});