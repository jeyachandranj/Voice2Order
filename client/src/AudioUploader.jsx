import React, { useState, useEffect } from 'react';
import axios from 'axios';
import productList from './products.json';

const AudioUploader = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [productData, setProductData] = useState([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(false);
  const [matchedProducts, setMatchedProducts] = useState([]);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [orderId, setOrderId] = useState('');

  // Handle file selection
  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setError('');
    setProductData([]);
  };

  // Upload file
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

      // Trigger data fetch
      setFetchTrigger(true);
      console.log('File uploaded successfully:', response.data);
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('An error occurred while processing the audio file.');
    } finally {
      setIsUploading(false);
    }
  };

  // Fetch data using useEffect
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:4000/transcriptions');
        const data = response.data;

        console.log('Fetched Data:', data);
        setProductData(data.products || []);
        setOrderId(data._id);
        console.log('Order ID:', data._id);
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

  const handleMatchedProducts = (productName) => {
    const filteredProducts = productList.filter((product) =>
      product.name.toLowerCase().includes(productName.toLowerCase())
    );
    setMatchedProducts(filteredProducts);
    setDropdownVisible(true);
  };

  const handleDropdownClick = async (selectedProductName) => {
    try {
      const selectedProduct = productList.find(
        (product) => product.name === selectedProductName
      );

      if (!selectedProduct) {
        setError('Selected product not found.');
        return;
      }

      const updatedProducts = productData.map((product) =>
        product.name === selectedProductName
          ? {
              ...product,
              quantity: selectedProduct.quantity || 1,
              unit: selectedProduct.unit || 'pcs',
            }
          : product
      );

      await axios.put(`http://localhost:4000/transcriptions/${orderId}`, {
        products: updatedProducts,
      });

      setProductData(updatedProducts);
      setDropdownVisible(false);
      console.log('Product overridden successfully.');
    } catch (error) {
      console.error('Error overriding product:', error);
      setError('An error occurred while overriding the product.');
    }
  };

  return (
    <div className="container">
      <h1 className="title">Audio to Product Data</h1>

      {/* File Upload Section */}
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

      {/* Error Message */}
      {error && <p className="error-message">{error}</p>}

      {/* Table for Product Data */}
      {productData.length > 0 ? (
        <table className="product-table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>Quantity</th>
              <th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {productData.map((product, index) => (
              <tr key={index}>
                <td onClick={() => handleMatchedProducts(product.name)}>
                  {product.name}
                </td>
                <td>{product.quantity}</td>
                <td>{product.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="no-data-message">
          No product data available. Upload an audio file to see results.
        </p>
      )}

      {/* Dropdown for Matching Products */}
      {dropdownVisible && matchedProducts.length > 0 && (
        <div className="dropdown">
          <ul>
            {matchedProducts.map((product) => (
              <li
                key={product.id}
                onClick={() => handleDropdownClick(product.name)}
              >
                {product.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AudioUploader;
