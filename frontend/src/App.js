
import React, { useRef, useEffect, useState, useCallback } from "react";
import "./App.css";

const App = () => {
  const videoRef = useRef(null);
  const intervalRef = useRef(null); // ✅ New stable reference for interval
  const [sentence, setSentence] = useState("");
  const [capturedGestures, setCapturedGestures] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [continuousMode, setContinuousMode] = useState(false);

  // Initialize webcam on component mount
  useEffect(() => {
    const currentVideo = videoRef.current;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
      })
      .then((stream) => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((error) => {
        console.error("Error accessing webcam:", error);
        setStatus("Failed to access webcam");
      });

    return () => {
      if (currentVideo && currentVideo.srcObject) {
        currentVideo.srcObject.getTracks().forEach((track) => track.stop());
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Capture frame logic
  const captureFrame = useCallback(async () => {
    setStatus("Capturing...");
    const video = videoRef.current;
    if (!video) {
      setStatus("Video element not ready");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(async (blob) => {
      if (!blob) {
        setStatus("Failed to capture frame");
        return;
      }

      const formData = new FormData();
      formData.append("file", blob, "frame.jpg");

      try {
        setIsCapturing(true);
        const response = await fetch("http://127.0.0.1:8000/predict/", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (data.gesture && data.gesture !== "No hand detected") {
          setCapturedGestures((prevGestures) => {
            const lastGesture =
              prevGestures.length > 0
                ? prevGestures[prevGestures.length - 1]
                : null;
            if (lastGesture !== data.gesture) {
              setStatus(`Captured: ${data.gesture}`);
              return [...prevGestures, data.gesture];
            }
            return prevGestures;
          });
        } else if (data.gesture === "No hand detected") {
          setStatus("No hand detected");
        } else {
          setStatus("No valid gesture detected");
        }
      } catch (error) {
        console.error("Error:", error);
        setStatus("Connection error");
      } finally {
        setIsCapturing(false);
      }
    }, "image/jpeg", 0.9);
  }, []);

  // Generate sentence using LLM
  const sendToLLM = useCallback(async () => {
    if (!capturedGestures || capturedGestures.length === 0) {
      setStatus("No gestures captured");
      return;
    }

    setStatus("Generating sentence...");

    try {
      const response = await fetch("http://127.0.0.1:8000/generate_sentence/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gestures: capturedGestures }),
      });

      const data = await response.json();

      if (data.sentence) {
        setSentence(data.sentence);
        setStatus("Sentence generated");
      } else {
        setSentence("Failed to generate sentence");
        setStatus("Generation failed");
      }
    } catch (error) {
      console.error("Error:", error);
      setStatus("Connection error");
    }
  }, [capturedGestures]);

  const clearGestures = useCallback(() => {
    setCapturedGestures([]);
    setSentence("");
    setStatus("Gestures cleared");
  }, []);

  // ✅ Stable toggle logic for continuous mode
  const toggleContinuousMode = useCallback(() => {
    if (!continuousMode) {
      const interval = setInterval(() => {
        captureFrame();
      }, 2000);
      intervalRef.current = interval;
      setContinuousMode(true);
      setStatus("Continuous mode: ON");
    } else {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      setContinuousMode(false);
      setStatus("Continuous mode: OFF");
    }
  }, [continuousMode, captureFrame]);

  // ⌨️ Keyboard shortcut handler
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (event.key === "s") {
        captureFrame();
      } else if (event.key === "o") {
        sendToLLM();
      } else if (event.key === "c") {
        clearGestures();
      } else if (event.key === "m") {
        toggleContinuousMode();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  }, [captureFrame, sendToLLM, clearGestures, toggleContinuousMode]);

  return (
    <div className="app-container">
      <h1>Sign Language Recognition</h1>

      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            width: "100%",
            maxWidth: "640px",
            height: "auto",
            border: "2px solid #3498db",
            borderRadius: "8px",
          }}
        />
        <div
          className="status-indicator"
          style={{ color: isCapturing ? "#e74c3c" : "#2ecc71" }}
        >
          {status}
        </div>
      </div>

      <div className="controls">
        <button
          onClick={captureFrame}
          disabled={isCapturing}
          className="control-button capture"
        >
          Capture Gesture (S)
        </button>
        <button
          onClick={sendToLLM}
          disabled={capturedGestures.length === 0}
          className="control-button generate"
        >
          Generate Sentence (O)
        </button>
        <button
          onClick={clearGestures}
          disabled={capturedGestures.length === 0}
          className="control-button clear"
        >
          Clear Gestures (C)
        </button>
        <button
          onClick={toggleContinuousMode}
          className={`control-button ${
            continuousMode ? "continuous-on" : "continuous-off"
          }`}
        >
          {continuousMode ? "Stop Continuous (M)" : "Start Continuous (M)"}
        </button>
      </div>

      <div className="result-container">
        <h2>Generated Sentence:</h2>
        <div className="sentence-display">
          {sentence || "No sentence generated yet"}
        </div>
      </div>

      <div className="gestures-container">
        <h2>Captured Gestures:</h2>
        {capturedGestures.length > 0 ? (
          <div className="gesture-list">
            {capturedGestures.map((gesture, index) => (
              <span key={index} className="gesture-item">
                {gesture}
                {index < capturedGestures.length - 1 ? " → " : ""}
              </span>
            ))}
          </div>
        ) : (
          <p>No gestures captured yet</p>
        )}
      </div>
    </div>
  );
};

export default App;
