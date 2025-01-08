import React, { useState, useEffect } from 'react';
import axios from 'axios';
import productList from './products.json';


const AudioUploader = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [productData, setProductData] = useState([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
  


  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setError('');
    setProductData([]);
  };

  const matchProductWithAI = async (productName) => {
    console.log('Matching product with AI:', productName);
  
    try {
      const response = await fetch('http://localhost:4000/api/match-product', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ productName }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to fetch data from the server');
      }
  
      const result = await response.json();
      console.log('Matched Product:', result);
      return result;
    } catch (error) {
      console.error('Error matching product:', error);
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

      

      setFetchTrigger(true);
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('An error occurred while processing the audio file.');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:4000/transcriptions');
        const data = response.data;



      if (response.data.products) {
        console.log('Response data:', response.data);
        const matchedProducts = [];
        
        // Process each product through Groq AI
        for (const product of response.data.products) {
          const matchedProduct = await matchProductWithAI(product.name);
          
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
            }
          } else {
            matchedProducts.push(product);
          }
        }

        setProductData(matchedProducts);
        console.log('Product data:', matchedProducts);
        setIsProcessing(true);
      }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('An error occurred while fetching product data.');
      }
    };

    if (fetchTrigger) {
      fetchData();
      setFetchTrigger(false);
    }
  }, [fetchTrigger]);






  const createOrder = async () => {
    try {
      const updatedProducts = productData.map((product) => {
        const matchedProduct = productList.find((item) => item.name === product.name);
        const price = matchedProduct ? matchedProduct.price : 0;
        const subtotal = product.quantity * price;

        return {
          ...product,
          price,
          subtotal,
        };
      });

      const response = await axios.post('http://localhost:4000/api/orders', {
        orderDate: new Date().toISOString(),
        status: 'pending',
        products: updatedProducts,
      });

      if (response.data) {
        setError('');
        alert('Order created successfully!');
        
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
          disabled={isUploading}
          className="upload-button"
        >
          {isUploading ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="content-container">
        <div className="table-container">
          {isProcessing ? (
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

        
        </div>
        <div>
          <button onClick={createOrder} className="history-button" style={{ marginLeft: '910px' }}>
            Order
          </button>
        </div>

       
      </div>

      <style jsx>{`
        .container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .content-container {
          position: relative;
        }

        .file-upload {
          margin-bottom: 20px;
        }

        .upload-button {
          padding: 10px;
          background-color: #4caf50;
          color: white;
          border: none;
          cursor: pointer;
        }

        .product-table {
          width: 100%;
          border-collapse: collapse;
        }

        .product-table th,
        .product-table td {
          border: 1px solid #ddd;
          padding: 8px;
          text-align: center;
        }

        .history-button {
          background-color: #4caf50;
          color: white;
          padding: 10px;
          border: none;
          cursor: pointer;
        }

        .dropdown {
          position: absolute;
          background-color: white;
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
          z-index: 1;
          min-width: 200px;
        }

        .dropdown ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .dropdown-item {
          padding: 8px;
          cursor: pointer;
        }

        .dropdown-item:hover {
          background-color: #f1f1f1;
        }

        .no-data-message {
          text-align: center;
          color: gray;
        }
      `}</style>
    </div>
  );
};

export default AudioUploader;
