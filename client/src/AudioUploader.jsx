import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AudioUploader = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [productData, setProductData] = useState([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(false);

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
      await axios.post('http://localhost:4000/transcribe', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Trigger data fetch
      setFetchTrigger(true);
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

        console.log('Fetched Data:', data); // Debugging: Log fetched data

        setProductData(data.products || []); // Correct data structure
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('An error occurred while fetching product data.');
      }
    };

    if (fetchTrigger) {
      fetchData();
      setFetchTrigger(false); // Reset trigger to avoid unnecessary fetches
    }
  }, [fetchTrigger]);

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
                <td>{product.name}</td>
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
    </div>
  );
};

export default AudioUploader;

