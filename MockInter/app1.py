import os
import json
import time
import threading
import requests
import streamlit as st
import numpy as np
import speech_recognition as sr
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
from deepface import DeepFace
import cv2
from PIL import Image

# -----------------------------
# ENV SETUP
# -----------------------------
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")

if not GROQ_API_KEY:
    st.error("GROQ_API_KEY not loaded. Check your .env file.")
    st.stop()

# -----------------------------
# GROQ CONFIG
# -----------------------------
GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"

GROQ_MODELS = [
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
    "gemma2-9b-it"
]

def call_groq(prompt, max_tokens=1200):
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    last_error = None

    for model in GROQ_MODELS:
        payload = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.6,
            "max_tokens": max_tokens
        }

        try:
            response = requests.post(
                GROQ_ENDPOINT,
                headers=headers,
                json=payload,
                timeout=30
            )

            if response.status_code == 200:
                return response.json()["choices"][0]["message"]["content"]

            if response.status_code == 400 and "decommissioned" in response.text:
                last_error = response.text
                continue

            last_error = response.text

        except Exception as e:
            last_error = str(e)

    raise RuntimeError(f"Groq API failed. Last error: {last_error}")

# -----------------------------
# MONGODB
# -----------------------------
client = MongoClient("mongodb://localhost:27017/")
db = client["mock_interviews"]
feedback_collection = db["feedbacks"]

# -----------------------------
# INTERVIEW LOGIC (USING GROQ)
# -----------------------------
def get_gemini_questions(job_role, tech_stack, experience):
    prompt = f"""
Generate five interview questions for a {job_role} role requiring experience in {tech_stack}.
The candidate has {experience} years of experience.
Number the questions.
"""

    response_text = call_groq(prompt)
    questions = response_text.split("\n")

    filtered_questions = []
    for q in questions:
        q = q.strip()
        if q and q[0].isdigit():
            if not q.endswith("?"):
                q += "?"
            filtered_questions.append(q)

    return filtered_questions


def process_answer(question, answer, avg_emotion):
    prompt = f"""
Evaluate the following candidate's answer to an interview question.
Provide a score out of 10 based on correctness, depth, and relevance.
Give detailed feedback.

Question: {question}
Answer: {answer}
Average Emotion: {avg_emotion}
"""
    return call_groq(prompt)


def record_audio():
    recognizer = sr.Recognizer()
    with sr.Microphone() as source:
        st.write("Recording... Speak now!")
        audio = recognizer.listen(source, timeout=5)
    try:
        return recognizer.recognize_google(audio)
    except sr.UnknownValueError:
        return "Could not understand audio"
    except sr.RequestError:
        return "Speech recognition service error"

# -----------------------------
# EMOTION TRACKING
# -----------------------------
emotion_list = []
emotion_lock = threading.Lock()

def track_emotions_from_webcam():
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        st.error("Could not access webcam")
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        try:
            result = DeepFace.analyze(
                frame,
                actions=['emotion'],
                enforce_detection=False
            )
            emotion = result[0]['dominant_emotion']
            with emotion_lock:
                emotion_list.append(emotion)
        except:
            pass

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        st.image(Image.fromarray(frame_rgb), caption="Live Webcam Feed", use_column_width=True)

        if st.button("Stop Emotion Tracking"):
            break

    cap.release()

def get_avg_emotion():
    with emotion_lock:
        if emotion_list:
            return max(set(emotion_list), key=emotion_list.count)
        return "No emotion detected"

# -----------------------------
# STREAMLIT STATE
# -----------------------------
if "interviews" not in st.session_state:
    st.session_state.interviews = []

# -----------------------------
# UI
# -----------------------------
st.title("AI Mock Interview")
st.subheader("Create and start your AI Mock Interview")

if st.button("+ Add New"):
    st.session_state.show_form = True

if st.session_state.get("show_form"):
    with st.form("interview_form"):
        username = st.text_input("Username")
        job_role = st.text_input("Job Role")
        tech_stack = st.text_input("Tech Stack")
        experience = st.number_input("Years of Experience", min_value=0)
        start_btn = st.form_submit_button("Start Interview")
        cancel_btn = st.form_submit_button("Cancel")

        if cancel_btn:
            st.session_state.show_form = False
            st.rerun()

        if start_btn:
            questions = get_gemini_questions(job_role, tech_stack, experience)
            interview_data = {
                "username": username,
                "role": job_role,
                "stack": tech_stack,
                "experience": experience,
                "questions": questions,
                "responses": []
            }
            st.session_state.current_interview = interview_data
            st.session_state.interviews.append(interview_data)
            st.session_state.question_index = 0
            st.session_state.show_form = False
            threading.Thread(target=track_emotions_from_webcam, daemon=True).start()
            st.rerun()

# -----------------------------
# INTERVIEW FLOW
# -----------------------------
if "current_interview" in st.session_state:
    interview = st.session_state.current_interview
    index = st.session_state.question_index

    st.subheader(f"Role: {interview['role']}")
    st.write(f"Tech Stack: {interview['stack']}")
    st.write(f"Experience: {interview['experience']} years")

    if index < len(interview["questions"]):
        st.subheader(f"Question {index + 1}")
        st.write(interview["questions"][index])

        answer = st.text_area("Your Answer", value=st.session_state.get("answer_text", ""))

        col1, col2 = st.columns(2)
        with col1:
            if st.button("Record Answer"):
                st.session_state.answer_text = record_audio()
                st.rerun()

        with col2:
            if st.button("Next Question"):
                avg_emotion = get_avg_emotion()
                feedback = process_answer(interview["questions"][index], answer, avg_emotion)

                response_data = {
                    "username": interview["username"],
                    "question": interview["questions"][index],
                    "answer": answer,
                    "feedback": feedback,
                    "emotion": avg_emotion
                }

                feedback_collection.insert_one(response_data)
                interview["responses"].append(response_data)
                st.session_state.answer_text = ""
                st.session_state.question_index += 1
                st.rerun()

    else:
        st.success("Interview Completed!")
        for r in interview["responses"]:
            st.write(f"**Q:** {r['question']}")
            st.write(f"**Answer:** {r['answer']}")
            st.write(f"**Feedback:** {r['feedback']}")
            st.write(f"**Emotion:** {r['emotion']}")

        if st.button("Close Interview"):
            del st.session_state["current_interview"]
            del st.session_state["question_index"]
            st.rerun()

# -----------------------------
# HISTORY
# -----------------------------
if st.session_state.interviews:
    st.subheader("Previous Interviews")
    for i in st.session_state.interviews:
        with st.expander(f"{i['role']} ({i['experience']} yrs)"):
            for r in i["responses"]:
                st.write(f"Q: {r['question']}")
                st.write(f"A: {r['answer']}")
                st.write(f"Feedback: {r['feedback']}")
                st.write(f"Emotion: {r['emotion']}")
