import os
import json
import requests
import streamlit as st
import pdfplumber
from dotenv import load_dotenv
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
# PDF TEXT EXTRACTION
# -----------------------------
def extract_resume_text(uploaded_file):
    text = ""
    with pdfplumber.open(uploaded_file) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
    return text.strip()

# -----------------------------
# STREAMLIT UI
# -----------------------------
st.set_page_config(page_title="ATS Resume Scanner")
st.title("ATS Resume Scanner")

job_description = st.text_area("Job Description", height=160)
resume_file = st.file_uploader("Upload Resume (PDF)", type=["pdf"])

analyze = st.button("Analyze Resume")
keywords = st.button("Extract Keywords")
match = st.button("Match Percentage")

# -----------------------------
# PROMPTS
# -----------------------------
ANALYZE_PROMPT = """
Analyze the resume against the job description.
Return strengths, weaknesses, and improvement suggestions.
"""

KEYWORDS_PROMPT = """
Extract skills in JSON:
{
  "Technical Skills": [],
  "Analytical Skills": [],
  "Soft Skills": []
}
Only include skills mentioned in the job description.
"""

MATCH_PROMPT = """
Give:
1. Match percentage
2. Missing keywords
3. Final recommendation
"""

# -----------------------------
# ACTIONS
# -----------------------------
if resume_file and job_description:

    resume_text = extract_resume_text(resume_file)

    if not resume_text:
        st.error("Could not extract text from resume PDF.")
        st.stop()

    # Safety: limit resume size
    resume_text = resume_text[:8000]

    if analyze:
        with st.spinner("Analyzing resume..."):
            prompt = f"""
JOB DESCRIPTION:
{job_description}

RESUME:
{resume_text}

TASK:
{ANALYZE_PROMPT}
"""
            st.write(call_groq(prompt))

    if keywords:
        with st.spinner("Extracting keywords..."):
            prompt = f"""
JOB DESCRIPTION:
{job_description}

RESUME:
{resume_text}

TASK:
{KEYWORDS_PROMPT}
"""
            output = call_groq(prompt)
            try:
                st.json(json.loads(output))
            except:
                st.write(output)

    if match:
        with st.spinner("Calculating match..."):
            prompt = f"""
JOB DESCRIPTION:
{job_description}

RESUME:
{resume_text}

TASK:
{MATCH_PROMPT}
"""
            st.write(call_groq(prompt))

elif analyze or keywords or match:
    st.warning("Upload resume and add job description first.")
