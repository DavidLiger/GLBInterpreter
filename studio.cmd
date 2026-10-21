@echo off
rem Studio GLBI (ST1, spec-app-bureau.md) : double-clic pour lancer le studio de fabrication d'un livre.
rem La page s'ouvre dans le navigateur (http://127.0.0.1:4000/) ; cette fenetre reste ouverte tant que le studio tourne.
rem Pour l'arreter : bouton "Tout arreter et quitter" de la page, ou Ctrl+C ici.
rem Sur le Bureau : clic droit sur studio.cmd, Envoyer vers, Bureau (creer un raccourci). Une copie du fichier hors du
rem repo ne trouverait pas le repo.
rem Icone du raccourci : clic droit sur le raccourci, Proprietes, Changer d'icone, Parcourir : studio.ico (a cote de ce
rem fichier, dans le repo).
setlocal
cd /d "%~dp0"
if not exist "package.json" (
  echo studio.cmd doit rester a la racine du repo GLBInterpreter.
  echo Pour le Bureau : clic droit sur studio.cmd, Envoyer vers, Bureau ^(creer un raccourci^).
  pause
  exit /b 1
)
title Studio GLBI
call npm run studio
if errorlevel 1 pause
