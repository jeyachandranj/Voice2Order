import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Trash2, Edit2, Save, X } from 'lucide-react';
import AudioRecorder from './AudioRecorder';
import productList from "./products.json"

const AudioUploader = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [productData, setProductData] = useState([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editedData, setEditedData] = useState({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const audioRef = useRef(null);

  // Clean up audio URL when component unmounts
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Play audio when processing starts
  useEffect(() => {
    if (isProcessing && selectedFile && audioRef.current) {
      const newAudioUrl = URL.createObjectURL(selectedFile);
      setAudioUrl(newAudioUrl);
      audioRef.current.src = newAudioUrl;
      audioRef.current.play().catch(err => {
        console.error('Error playing audio:', err);
        setError('Failed to play audio file');
      });
    }
  }, [isProcessing, selectedFile]);

  const handleClear = () => {
    setIsClearing(true);
    setProductData([]);
    setSelectedFile(null);
    setError('');
    setIsProcessing(false);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsClearing(false);
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      setError('');
      
      // Clean up previous audio URL
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
    }
  };

  const updateProductWithPrice = (product) => {
    // Find matching product from productList
    const matchedProduct = productList.find(p => 
      p.name.toLowerCase() === product.name.toLowerCase()
    );
    
    if (matchedProduct) {
      return {
        ...product,
        price: matchedProduct.price,
        subtotal: matchedProduct.price * product.qty
      };
    }
    
    return {
      ...product,
      price: 0,
      subtotal: 0
    };
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
        // Update products with prices
        const productsWithPrices = response.data.products.map(updateProductWithPrice);
        setProductData(productsWithPrices);
        setIsProcessing(true);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('An error occurred while processing the audio file.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleEdit = (index) => {
    setEditingRow(index);
    setEditedData({
      ...productData[index],
      quantity: productData[index].qty
    });
  };

  const handleSave = (index) => {
    const updatedProduct = {
      ...productData[index],
      ...editedData,
      qty: editedData.quantity,
    };
    
    // Update price and subtotal
    const finalProduct = updateProductWithPrice(updatedProduct);
    
    const updatedProducts = [...productData];
    updatedProducts[index] = finalProduct;
    
    setProductData(updatedProducts);
    setEditingRow(null);
    setEditedData({});
  };

  const handleCancel = () => {
    setEditingRow(null);
    setEditedData({});
  };

  const handleDelete = (index) => {
    const updatedProducts = productData.filter((_, i) => i !== index);
    setProductData(updatedProducts);
  };

  const handleChange = (field, value, type = 'text') => {
    let processedValue = value;
    if (type === 'number') {
      processedValue = parseFloat(value) || 0;
    }
    
    const updatedData = {
      ...editedData,
      [field]: processedValue
    };

    // Update quantity and subtotal if needed
    if (field === 'quantity') {
      updatedData.qty = processedValue;
      const matchedProduct = productList.find(p => 
        p.name.toLowerCase() === editedData.name.toLowerCase()
      );
      if (matchedProduct) {
        updatedData.subtotal = matchedProduct.price * processedValue;
      }
    }

    setEditedData(updatedData);
  };

  const createOrder = async () => {
    try {
      const response = await axios.post('http://localhost:4000/api/orders', {
        products: productData.map(product => ({
          name: product.name,
          quantity: product.qty,
          price: product.price,
          subtotal: product.subtotal
        }))
      });

      if (response.data) {
        setError('');
        alert('Order created successfully!');
        setShowConfirmDialog(false);
        handleClear();
      }
    } catch (error) {
      console.error('Error creating order:', error);
      setError('An error occurred while creating the order.');
    }
  };

  const calculateTotal = () => {
    return productData.reduce((total, product) => total + (product.subtotal || 0), 0);
  };

  return (
    <div className="container">
      <h1 className="title">Audio to Product Data</h1>
      <audio ref={audioRef} className="hidden" controls />

      <div className="upload-section">
        <div className="file-upload">
          <input
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="file-input"
          />
          <div className="button-group">
            <button
              onClick={handleUpload}
              disabled={isUploading || !selectedFile}
              className="upload-button"
            >
              {isUploading ? 'Processing...' : 'Process'}
            </button>
            <button
              onClick={handleClear}
              disabled={isClearing || (!productData.length && !selectedFile)}
              className="clear-button"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="recorder-section">
          <AudioRecorder 
            onRecordingComplete={(audioFile) => {
              setSelectedFile(audioFile);
              setError('');
            }} 
          />
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="content-container">
        <div className="table-container">
          {isProcessing ? (
            <table className="product-table">
              <thead>
                <tr>
                  <th>Human Voice</th>
                  <th>Product Name</th>
                  <th>Unit</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>Subtotal</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {productData.map((product, index) => (
                  <tr key={index}>
                    <td>
                      {editingRow === index ? (
                        <input
                          type="text"
                          value={editedData.name || ''}
                          onChange={(e) => handleChange('name', e.target.value)}
                          className="edit-input"
                        />
                      ) : (
                        (() => {
                          const match = product.ainame.match(/\d+\.\s*(.+)/); // Inline function
                          return <span>{match ? match[1].toUpperCase() : "No name found"}</span>; // Extract and return the name wrapped in a <span>
                        })()
                      )}
                    </td>
                    <td>
                      {editingRow === index ? (
                        <input
                          type="text"
                          value={editedData.name || ''}
                          onChange={(e) => handleChange('name', e.target.value)}
                          className="edit-input"
                        />
                      ) : (
                        product.name
                      )}
                    </td>
                    <td>
                      {editingRow === index ? (
                        <input
                          type="text"
                          value={editedData.unit || ''}
                          onChange={(e) => handleChange('unit', e.target.value)}
                          className="edit-input"
                        />
                      ) : (
                        product.unit
                      )}
                    </td>
                    <td>
                      {editingRow === index ? (
                        <input
                          type="number"
                          value={editedData.quantity || 0}
                          onChange={(e) => handleChange('quantity', e.target.value, 'number')}
                          className="edit-input"
                        />
                      ) : (
                        product.qty
                      )}
                    </td>
                    <td>₹{product.price || 0}</td>
                    <td>₹{product.subtotal || 0}</td>
                    <td className="action-buttons">
                      {editingRow === index ? (
                        <>
                          <button onClick={() => handleSave(index)} className="icon-button save">
                            <Save size={18} />
                          </button>
                          <button onClick={handleCancel} className="icon-button cancel">
                            <X size={18} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => handleEdit(index)} className="icon-button edit">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleDelete(index)} className="icon-button delete">
                            <Trash2 size={18} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan="5" className="font-bold text-right">Total</td>
                  <td className="font-bold">₹{calculateTotal()}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="no-data-message">
              No product data available. Upload an audio file to see results.
            </p>
          )}
        </div>

        {productData.length > 0 && (
          <div className="text-right mt-4">
            <button 
              onClick={() => setShowConfirmDialog(true)} 
              className="order-button"
            >
              Order
            </button>
          </div>
        )}

        {showConfirmDialog && (
          <div className="popup-overlay">
            <div className="popup-content">
              <h3 className="popup-title">Confirm Order</h3>
              <p className="popup-message">
                Are you sure you want to create this order?
                <br />
                <span className="popup-total">
                  Total Amount: ₹{calculateTotal()}
                </span>
              </p>
              <div className="popup-buttons">
                <button 
                  onClick={() => setShowConfirmDialog(false)} 
                  className="popup-button cancel"
                >
                  Cancel
                </button>
                <button 
                  onClick={createOrder} 
                  className="popup-button confirm"
                >
                  Confirm Order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .container {
          padding: 20px;
          max-width: 1200px;
          margin: 0 auto;
          background-color: white;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          border-radius: 10px;
        }

        .file-upload {
          margin-bottom: 20px;
        }

          .upload-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  gap: 20px;
}

.file-upload {
  flex: 1;
}

.recorder-section {
  flex: 1;
  max-width: 300px;
}

        .upload-button {
          padding: 10px;
          background-color: #02b290;
          color: white;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: background-color 0.3s ease;
        }

        .product-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }

        .product-table th,
        .product-table td {
          border: 1px solid #ddd;
          padding: 10px;
          text-align: center;
        }

        .product-table th {
          background-color: #02b290;
          color: white;
        }

        .edit-input {
          width: 100%;
          padding: 4px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }

        .icon-button {
          padding: 4px;
          margin: 0 2px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          background: none;
        }

        .icon-button.edit {
          color: #4a90e2;
        }

        .icon-button.delete {
          color: #e74c3c;
        }

        .icon-button.save {
          color: #27ae60;
        }

        .icon-button.cancel {
          color: #e74c3c;
        }

        .order-button {
          background-color: orange;
          color: white;
          padding: 10px 20px;
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: background-color 0.3s ease;
        }

        .order-button:hover {
          background-color: #e69500;
        }

        .button-group {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}

.clear-button {
  padding: 10px;
  background-color: #dc2626;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.clear-button:hover:not(:disabled) {
  background-color: #b91c1c;
}

.clear-button:disabled {
  background-color: #f87171;
  cursor: not-allowed;
}

.file-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 5px;
  margin-bottom: 10px;
}

        .action-buttons {
          white-space: nowrap;
        }

         .popup-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .popup-content {
          background-color: white;
          padding: 24px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
          width: 90%;
          max-width: 400px;
        }

        .popup-title {
          margin: 0 0 16px 0;
          font-size: 20px;
          font-weight: bold;
          color: #333;
        }

        .popup-message {
          margin-bottom: 20px;
          color: #666;
        }

        .popup-total {
          display: block;
          margin-top: 10px;
          font-weight: bold;
          color: #333;
        }

        .popup-buttons {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }

        .popup-button {
          padding: 8px 16px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 500;
          transition: background-color 0.2s;
        }

        .popup-button.cancel {
          background-color: #f1f1f1;
          color: #666;
        }

        .popup-button.cancel:hover {
          background-color: #e1e1e1;
        }

        .popup-button.confirm {
          background-color: orange;
          color: white;
        }

        .popup-button.confirm:hover {
          background-color: #e69500;
        }
      `}</style>
    </div>
  );
};

export default AudioUploader;