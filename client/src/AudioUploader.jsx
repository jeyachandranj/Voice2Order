import React, { useState, useEffect } from 'react';
import axios from 'axios';
import productList from './products.json';
import { Trash2, Edit2, Save, X } from 'lucide-react';
import AudioRecorder from './AudioRecorder';


const AudioUploader = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [productData, setProductData] = useState([]);
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editedData, setEditedData] = useState({});
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);


  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setError('');
    setProductData([]);
  };

  const matchProductWithAI = async (productName) => {
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
      await axios.post('http://localhost:4000/transcribe', formData, {
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

  const handleEdit = (index) => {
    setEditingRow(index);
    setEditedData(productData[index]);
  };

  const handleSave = (index) => {
    const updatedProducts = [...productData];
    const matchedProduct = productList.find(p => p.name === editedData.name);
    
    updatedProducts[index] = {
      ...editedData,
      price: matchedProduct?.price || editedData.price || 0,
      subtotal: (matchedProduct?.price || editedData.price || 0) * editedData.quantity
    };
    
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
    setEditedData(prev => ({
      ...prev,
      [field]: processedValue,
      ...(field === 'quantity' && {
        subtotal: (prev.price || 0) * processedValue
      })
    }));
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get('http://localhost:4000/transcriptions');

        if (response.data.products) {
          const matchedProducts = [];
          
          for (const product of response.data.products) {
            const matchedProduct = await matchProductWithAI(product.name);
            const matchedPriceProduct = productList.find(p => p.name === matchedProduct.name);

            if (matchedPriceProduct) {
              matchedProducts.push({
                ...product,
                name: matchedPriceProduct.name,
                price: matchedPriceProduct.price,
                subtotal: matchedPriceProduct.price * product.quantity,
              });
            } else {
              matchedProducts.push(product);
            }
          }

          setProductData(matchedProducts);
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
      const response = await axios.post('http://localhost:4000/api/orders', {
        orderDate: new Date().toISOString(),
        status: 'pending',
        products: productData,
      });

      if (response.data) {
        setError('');
        alert('Order created successfully!');
        setShowConfirmDialog(false);

      }
    } catch (error) {
      console.error('Error creating order:', error);
      setError('An error occurred while creating the order.');
    }
  };

  return (
    <div className="container">
      <h1 className="title">Audio to Product Data</h1>
      <div className="upload-section">
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


        <div className="recorder-section">
          <AudioRecorder 
            onRecordingComplete={(audioFile) => {
              setSelectedFile(audioFile);
              setError('');
              setProductData([]);
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
                  <th>Product Name</th>
                  <th>Unit</th>
                  <th>Quantity</th>
                  <th>Price</th>
                  <th>SubTotal</th>
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
                        product.quantity
                      )}
                    </td>
                    <td>
                    
                        {product.price || 0}
                    </td>
                    <td>{editingRow === index ? editedData.subtotal || 0 : product.subtotal || 0}</td>
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
                  <td colSpan="4" className="font-bold text-right">Total</td>
                  <td className="font-bold">
                    {productData.reduce((total, product) => total + (product.subtotal || 0), 0)}
                  </td>
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
        <div className="text-right mt-4">
        <button 
          onClick={() => setShowConfirmDialog(true)} 
          className="order-button"
        >
          Order
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="popup-overlay">
          <div className="popup-content">
            <h3 className="popup-title">Confirm Order</h3>
            <p className="popup-message">
              Are you sure you want to create this order?
              <br />
              <span className="popup-total">
                Total Amount: {productData.reduce((total, product) => total + (product.subtotal || 0), 0)}
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