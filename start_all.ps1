Write-Host "Starting all TalentTrack services..."

# Aptitude apps
Start-Process powershell "-NoExit -Command cd Aptitude; streamlit run AptiApp.py"
Start-Process powershell "-NoExit -Command cd Aptitude; streamlit run InteractiveDashboard.py"

# Coding Practice apps
Start-Process powershell "-NoExit -Command cd CodingPract; streamlit run DSA_app_db.py"
Start-Process powershell "-NoExit -Command cd CodingPract; streamlit run DSA_dash.py"

# Mock Interview app
Start-Process powershell "-NoExit -Command cd MockInter; streamlit run app.py"

# Resume ATS app
Start-Process powershell "-NoExit -Command cd ResumeATS; streamlit run app.py"

# Node backend
Start-Process powershell "-NoExit -Command node server.js"

# Frontend
Start-Process index.html
