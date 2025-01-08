import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Groq } from 'groq-sdk';
import productList from './products.json';

const AudioUploader = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [productData, setProductData] = useState([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [changeHistory, setChangeHistory] = useState([]);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setError('');
    setProductData([]);
    setChangeHistory([]);
  };

  const matchProductWithAI = async (productName, productList) => {
    console.log('Matching product with AI:', productName);
    console.log('Product list:', productList);
    const groq = new Groq({ apiKey: "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" });
    
    const prompt = `
      Given the product name "${productName}" and the following product list:
      ${JSON.stringify(productList)}
      
      Find the single best matching product from the list. Consider similar names, common misspellings, and abbreviations.
      Return only the exact matching product object from the list. If no good match is found, return null.
      The response should be just the matching product object or null, with no additional explanation.
    `;

    try {
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        max_tokens: 500
      });

      const result = completion.choices[0]?.message?.content;
      return result ? JSON.parse(result) : null;
    } catch (error) {
      console.error('Groq AI matching error:', error);
      return null;
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select an audio file to upload.');
      return;
    }

    const formData = new FormData();
    formData.append('audioFile', selectedFile);

    try {
      setIsUploading(true);
      setError('');
      const response = await axios.post('http://localhost:4000/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.products) {
        setIsProcessing(true);
        const matchedProducts = [];
        
        // Process each product through Groq AI
        for (const product of response.data.products) {
          const matchedProduct = await matchProductWithAI(product.name, productList);
          
          if (matchedProduct) {
            matchedProducts.push({
              ...product,
              name: matchedProduct.name,
              price: matchedProduct.price,
              subtotal: matchedProduct.price * product.quantity
            });

            // Record the change if product name was different
            if (product.name !== matchedProduct.name) {
              const changeRecord = {
                timestamp: new Date().toISOString(),
                oldValue: product.name,
                newValue: matchedProduct.name,
                productIndex: matchedProducts.length - 1,
              };
              setChangeHistory(prev => [...prev, changeRecord]);
            }
          } else {
            matchedProducts.push(product);
          }
        }

        setProductData(matchedProducts);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('An error occurred while processing the audio file.');
    } finally {
      setIsUploading(false);
    }
  };

  const generatePDF = async (orderData) => {
    try {
      const response = await axios.post('http://localhost:4000/api/generate-pdf', {
        orderId: orderId,
        orderDate: new Date(orderData.orderDate).toLocaleString(),
        products: orderData.products,
        total: orderData.products.reduce((sum, product) => sum + product.subtotal, 0),
        status: orderData.status
      }, {
        responseType: 'blob' 
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `order-${orderData.orderId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error generating PDF:', error);
      setError('An error occurred while generating the PDF.');
    }
  };

  const createOrder = async () => {
    try {
      const response = await axios.post('http://localhost:4000/api/orders', {
        orderDate: new Date().toISOString(),
        status: 'pending',
        products: productData,
      });

      if (response.data) {
        setOrderId(response.data.orderId);
        setError('');
        alert('Order created successfully!');
        await generatePDF(response.data);
      }
    } catch (error) {
      console.error('Error creating order:', error);
      setError('An error occurred while creating the order.');
    }
  };

  return (
    <div className="container">
      <h1 className="title">Audio to Product Data</h1>

      <div className="file-upload">
        <input
          type="file"
          accept="audio/*"
          onChange={handleFileChange}
          className="file-input"
        />
        <button
          onClick={handleUpload}
          disabled={isUploading || isProcessing}
          className="upload-button"
        >
          {isUploading ? 'Uploading...' : isProcessing ? 'Processing...' : 'Upload'}
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="content-container">
        <div className="table-container">
          {productData.length > 0 ? (
            <table className="product-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Unit</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>SubTotal</th>
                </tr>
              </thead>
              <tbody>
                {productData.map((product, index) => (
                  <tr key={index}>
                    <td>{product.name}</td>
                    <td>{product.unit}</td>
                    <td>{product.quantity}</td>
                    <td>{product.price || 0}</td>
                    <td>{product.subtotal || 0}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan="4" style={{ fontWeight: 'bold', textAlign: 'right' }}>
                    Total
                  </td>
                  <td style={{ fontWeight: 'bold' }}>
                    {productData.reduce((total, product) => total + (product.subtotal || 0), 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="no-data-message">
              No product data available. Upload an audio file to see results.
            </p>
          )}

          {changeHistory.length > 0 && (
            <div className="history-section">
              <h2>Product Matches</h2>
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Original Product</th>
                    <th>Matched To</th>
                  </tr>
                </thead>
                <tbody>
                  {changeHistory.map((change, index) => (
                    <tr key={index}>
                      <td>{new Date(change.timestamp).toLocaleString()}</td>
                      <td>{change.oldValue}</td>
                      <td>{change.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <button 
            onClick={createOrder} 
            className="order-button"
            disabled={!productData.length}
          >
            Create Order
          </button>
        </div>
      </div>

      
    </div>
  );
};

export default AudioUploader;