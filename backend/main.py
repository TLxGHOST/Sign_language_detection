from fastapi import FastAPI, File, UploadFile
import numpy as np
import cv2
from sklearn.calibration import LabelEncoder
import tensorflow as tf
import mediapipe as mp
import uvicorn
from pydantic import BaseModel
import json
import google.generativeai as genai
from fastapi.middleware.cors import CORSMiddleware
# Load the model

model = tf.keras.models.load_model("./models/model3.h5")
label_encoder = LabelEncoder()
# label_encoder.classes_ = np.load('./models/label_class2.npy').astype(str) 
label_encoder.classes_ = np.load('./models/label_class.npy') # last wlae model ko chod ke baaki sab ke liye ye line hai 


# Initialize Mediapipe for hand detection
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(static_image_mode=False, max_num_hands=2, min_detection_confidence=0.6)
mp_drawing = mp.solutions.drawing_utils

# Initialize FastAPI
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Change to frontend URL for better security
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods (GET, POST, OPTIONS, etc.)
    allow_headers=["*"],  # Allow all headers
)

# Define request model
class GestureInput(BaseModel):
    gestures: list

# Function to preprocess image
def process_image(image):
    img_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    result = hands.process(img_rgb)

    if result.multi_hand_landmarks:
        for hand_landmarks in result.multi_hand_landmarks:
            img_h, img_w, _ = image.shape
            x_min, y_min = img_w, img_h
            x_max, y_max = 0, 0

            for landmark in hand_landmarks.landmark:
                x, y = int(landmark.x * img_w), int(landmark.y * img_h)
                x_min, y_min = min(x, x_min), min(y, y_min)
                x_max, y_max = max(x, x_max), max(y, y_max)

            padding = 20
            x_min = max(0, x_min - padding)
            y_min = max(0, y_min - padding)
            x_max = min(img_w, x_max + padding)
            y_max = min(img_h, y_max + padding)

            cropped_hand = image[y_min:y_max, x_min:x_max]
            cropped_hand = cv2.cvtColor(cropped_hand, cv2.COLOR_BGR2RGB)
            cropped_hand = cv2.resize(cropped_hand, (128, 128))
            cropped_hand = np.expand_dims(cropped_hand, axis=0) / 255.0

            predictions = model.predict(cropped_hand)
            #gesture_label_encoded = np.argmax(predictions, axis=1)[0]
            gesture_label_encoded = np.argmax(predictions, axis=1)[0] #last wale ko chod ke baaki sab ke liye ye line hai 
            gesture_label = label_encoder.inverse_transform([gesture_label_encoded])[0]

            # return str(gesture_label)
            return gesture_label # sirf last wale ko chod ke baaki sare models sahi return kar rahe hai

    return "No hand detected"

# Route to predict gesture
@app.post("/predict/")
async def predict(file: UploadFile = File(...)):
    image_data = await file.read()
    image_np = np.frombuffer(image_data, np.uint8)
    image = cv2.imdecode(image_np, cv2.IMREAD_COLOR)

    gesture = process_image(image)
    return {"gesture": gesture}

# Google Gemini API Integration
genai.configure(api_key="AIzaSyCgx2Ny_P5PKNRGKdSpEPNmPr8MQq7DC3I")

@app.post("/generate_sentence/")
async def generate_sentence(input_data: GestureInput):
    print(f"Received Request: {input_data.gestures}")  # Debugging

    if not input_data.gestures or len(input_data.gestures) == 0:
        print("Error: No gestures provided.")
        return {"error": "No gestures provided."}

    gestures = " ".join(input_data.gestures).strip()
    print(f"Debug - Gestures received: {gestures}")

    model = genai.GenerativeModel("gemini-2.0-flash")
    response = model.generate_content(
        f"Using only these words: {gestures}, generate a natural, concise, and grammatically correct sentence. You may rearrange the words and add minimal connecting words if necessary for clarity, but do not add unrelated content. The sentence should clearly convey the intended meaning as a human would express it. Use emojis only if they enhance understanding, and keep the response brief and to the point."
    )

    sentence = response.text.strip() if response.text else "Error generating sentence."
    print(f"Debug - Gemini Response: {sentence}")  # Check what Gemini is returning

    return {"sentence": sentence}





if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)