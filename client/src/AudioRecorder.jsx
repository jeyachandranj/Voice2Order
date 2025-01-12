import React, { useState, useRef } from 'react';
import { Mic, Square } from 'lucide-react';

const AudioRecorder = ({ onRecordingComplete }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorder = useRef(null);
  const timerInterval = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream);
      const chunks = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/wav' });
        const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });
        onRecordingComplete(audioFile);
        setRecordingTime(0);
      };

      mediaRecorder.current.start();
      setIsRecording(true);
      
      timerInterval.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Error accessing microphone. Please ensure microphone permissions are granted.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      mediaRecorder.current.stop();
      mediaRecorder.current.stream.getTracks().forEach(track => track.stop());
      clearInterval(timerInterval.current);
      setIsRecording(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="recorder-wrapper">
      <h3>Record Audio</h3>
      <div className="recorder-container">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`record-button ${isRecording ? 'recording' : ''}`}
          title={isRecording ? 'Stop Recording' : 'Start Recording'}
        >
          {isRecording ? <Square size={24} /> : <Mic size={24} />}
        </button>
        <div className="timer">{formatTime(recordingTime)}</div>
      </div>

      <style jsx>{`
        .recorder-wrapper {
          padding: 20px;
          border-radius: 8px;
          background-color: #f8f9fa;
          height: 100%;
        }

        h3 {
          margin: 0 0 15px 0;
          color: #333;
          text-align: center;
        }

        .recorder-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
        }

        .record-button {
          background-color: white;
          border: 2px solid #02b290;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s ease;
          color: #02b290;
        }

        .record-button:hover {
          background-color: #02b290;
          color: white;
          transform: scale(1.05);
        }

        .record-button.recording {
          background-color: #ff4444;
          border-color: #ff4444;
          color: white;
          animation: pulse 2s infinite;
        }

        .timer {
          font-size: 1.5rem;
          font-weight: 500;
          color: #666;
          min-width: 70px;
          text-align: center;
        }

        @keyframes pulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};

export default AudioRecorder;