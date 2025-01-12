import React from 'react';

const LoadingSpinner = ({ percentage }) => {
  return (
    <div className="spinner-container">
      <div className="spinner-outer">
        <div 
          className="spinner-inner" 
          style={{ transform: `rotate(${percentage * 3.6}deg)` }}
        />
      </div>
      <div className="percentage">{Math.round(percentage)}%</div>

      <style jsx>{`
        .spinner-container {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.7);
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 1000;
        }

        .spinner-outer {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: conic-gradient(
            from 0deg,
            #02b290 0%,
            #02b290 ${percentage}%,
            #ffffff26 ${percentage}%,
            #ffffff26 100%
          );
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
        }

        .spinner-outer::before {
          content: '';
          position: absolute;
          width: 110px;
          height: 110px;
          background-color: rgba(0, 0, 0, 0.8);
          border-radius: 50%;
        }

        .percentage {
          position: absolute;
          font-size: 24px;
          font-weight: bold;
          color: white;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LoadingSpinner;