# Push this project to GitHub (serviceconnectpro)

Run these commands in a terminal from the **serviceconnect** folder (the one that contains `backend`, `frontend`, and `.gitignore`).

## 1. Go to the project folder
```powershell
cd c:\Users\infoj\Desktop\serviceconnect\serviceconnect
```

## 2. Point origin to your new repo
```powershell
git remote set-url origin https://github.com/MissMckay/serviceconnectpro.git
git remote -v
```
You should see `origin` → `https://github.com/MissMckay/serviceconnectpro.git`

## 3. Stop tracking backend/node_modules if it was ever committed
```powershell
git rm -r --cached backend/node_modules 2>$null; git rm -r --cached frontend/node_modules 2>$null; Write-Host "Done"
```

## 4. Stage all changes (respects .gitignore; .env and node_modules stay local)
```powershell
git add .
```

## 5. Commit
```powershell
git commit -m "ServiceConnect: MongoDB Atlas, JWT auth, per-tab sessions, admin self-registration, services fixes"
```

## 6. Push to GitHub (create main branch if needed)
```powershell
git branch -M main
git push -u origin main
```

If GitHub asks for login, use your GitHub username and a **Personal Access Token** (not your password).  
Create a token: GitHub → Settings → Developer settings → Personal access tokens → Generate new token (repo scope).

---

After this, your code will be at: **https://github.com/MissMckay/serviceconnectpro**
