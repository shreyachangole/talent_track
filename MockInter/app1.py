import os
import json
import requests
import streamlit as st
import pdfplumber
import speech_recognition as sr
import cv2
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv
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
# GROQ CONFIG (Working ATS logic)
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
# MongoDB
# -----------------------------
client = MongoClient("mongodb://localhost:27017/")
db = client["mock_interviews"]
feedback_collection = db["feedbacks"]

# -----------------------------
# Audio Recording
# -----------------------------
def record_audio():
    import speech_recognition as sr
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
# Interview Functions
# -----------------------------
def get_gemini_questions(job_role, tech_stack, experience):
    prompt = f"""
Generate five interview questions for a {job_role} role requiring experience in {tech_stack}.
The candidate has {experience} years of experience.
Number the questions.
"""
    output = call_groq(prompt)
    questions = []
    for line in output.split("\n"):
        line = line.strip()
        if line and line[0].isdigit():
            if not line.endswith("?"):
                line += "?"
            questions.append(line)
    return questions

def process_answer(question, answer):
    prompt = f"""
Evaluate the following candidate's answer.
Give score out of 10 and detailed feedback.

Question: {question}
Answer: {answer}
"""
    return call_groq(prompt)

# -----------------------------
# Session State
# -----------------------------
if "interviews" not in st.session_state:
    st.session_state.interviews = []

# -----------------------------
# UI
# -----------------------------
st.title("AI Mock Interview")
if "current_interview" not in st.session_state:
    if st.button("+ Add New"):
        st.session_state.show_form = True

    if st.session_state.get("show_form"):
        with st.form("interview_form"):
            username = st.text_input("Username")
            job_role = st.text_input("Job Role")
            tech_stack = st.text_input("Tech Stack")
            experience = st.number_input("Experience", min_value=0)
            start = st.form_submit_button("Start Interview")

            if start:
                questions = get_gemini_questions(job_role, tech_stack, experience)
                st.session_state.current_interview = {
                    "username": username,
                    "role": job_role,
                    "stack": tech_stack,
                    "experience": experience,
                    "questions": questions,
                    "responses": []
                }
                st.session_state.question_index = 0
                st.rerun()

# -----------------------------
# Interview Flow
# -----------------------------
if "current_interview" in st.session_state:
    interview = st.session_state.current_interview
    idx = st.session_state.question_index

    if idx < len(interview["questions"]):
        st.subheader(interview["questions"][idx])
        answer = st.text_area("Your Answer")

        if st.button("Next"):
            feedback = process_answer(interview["questions"][idx], answer)
            data = {
                "question": interview["questions"][idx],
                "answer": answer,
                "feedback": feedback
            }
            feedback_collection.insert_one(data)
            interview["responses"].append(data)
            st.session_state.question_index += 1
            st.rerun()
    else:
        st.success("Interview Completed!")
        for r in interview["responses"]:
            st.write(r["question"])
            st.write(r["feedback"])
